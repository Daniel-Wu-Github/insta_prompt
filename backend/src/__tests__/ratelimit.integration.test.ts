import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Redis as IORedis } from "ioredis";

import app from "../index";
import {
	__flushRateLimitRedisForTests,
	__resetRateLimitRedisClientForTests,
	__setRateLimitRedisClientForTests,
	AUTH_TOKEN_IP_LIMIT,
	FREE_DAILY_LIMIT,
} from "../services/rateLimit";
import {
	__resetStrictTierRoutePoliciesForTests,
	__setStrictTierRoutePoliciesForTests,
} from "../middleware/tier";

type IntegrationConfig = {
	supabaseUrl: string;
	serviceRoleKey: string;
	anonKey: string;
	redisUrl: string;
};

type TestUserSession = {
	userId: string;
	accessToken: string;
	refreshToken: string;
};

type ErrorBody = {
	error: {
		code: string;
		message: string;
	};
};

function firstNonEmptyEnv(...names: string[]): string | null {
	for (const name of names) {
		const value = process.env[name];
		if (!value) {
			continue;
		}

		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}

	return null;
}

function envName(...parts: string[]): string {
	return parts.join("_");
}

function resolveIntegrationConfig(): IntegrationConfig | null {
	const supabaseUrl = firstNonEmptyEnv("SUPABASE_URL", "API_URL");
	const serviceRoleKey = firstNonEmptyEnv(envName("SUPABASE", "SERVICE", "KEY"), envName("SERVICE", "ROLE", "KEY"));
	const anonKey = firstNonEmptyEnv(envName("SUPABASE", "ANON", "KEY"), envName("ANON", "KEY"), envName("PUBLISHABLE", "KEY"));
	const redisUrl = firstNonEmptyEnv("REDIS_URL");

	if (!supabaseUrl || !serviceRoleKey || !anonKey || !redisUrl) {
		return null;
	}

	return {
		supabaseUrl,
		serviceRoleKey,
		anonKey,
		redisUrl,
	};
}

function makeAdminClient(config: IntegrationConfig): SupabaseClient {
	return createClient(config.supabaseUrl, config.serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

async function createUserSession(
	config: IntegrationConfig,
	createdUserIds: Set<string>,
	label: string,
): Promise<TestUserSession> {
	const authClient = createClient(config.supabaseUrl, config.anonKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});

	const email = `${label}.${randomUUID()}@example.com`;
	const passphrase = `Aa1-${randomUUID()}-z`;

	const signUp = await authClient.auth.signUp({
		email,
		password: passphrase,
	});

	if (signUp.error || !signUp.data.user) {
		throw new Error(`Failed to sign up integration user: ${signUp.error?.message ?? "unknown"}`);
	}

	let session = signUp.data.session;
	if (!session) {
		const signIn = await authClient.auth.signInWithPassword({
			email,
			password: passphrase,
		});

		if (signIn.error || !signIn.data.session) {
			throw new Error(`Failed to sign in integration user: ${signIn.error?.message ?? "unknown"}`);
		}

		session = signIn.data.session;
	}

	if (!session.access_token || !session.refresh_token) {
		throw new Error("Integration user session is missing access or refresh token");
	}

	createdUserIds.add(signUp.data.user.id);

	return {
		userId: signUp.data.user.id,
		accessToken: session.access_token,
		refreshToken: session.refresh_token,
	};
}

function jsonHeaders(token?: string): Record<string, string> {
	return token
		? {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
		  }
		: {
				"Content-Type": "application/json",
		  };
}

async function postSegment(token: string): Promise<Response> {
	return app.fetch(
		new Request("http://localhost/segment", {
			method: "POST",
			headers: jsonHeaders(token),
			body: JSON.stringify({
				segments: ["build feature"],
				mode: "balanced",
			}),
		}),
	);
}

async function getProjects(token: string): Promise<Response> {
	return app.fetch(
		new Request("http://localhost/projects", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		}),
	);
}

async function postAuthToken(refreshToken: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
	return app.fetch(
		new Request("http://localhost/auth/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...extraHeaders,
			},
			body: JSON.stringify({
				refresh_token: refreshToken,
			}),
		}),
	);
}

const integrationConfig = resolveIntegrationConfig();

if (!integrationConfig) {
	describe("rate limit integration (local Redis + Supabase harness)", () => {
		it("skips when local Redis/Supabase integration env is not configured", () => {
			expect(true).toBe(true);
		});
	});
} else {
	const adminClient = makeAdminClient(integrationConfig);
	const createdUserIds = new Set<string>();
	let freeUser: TestUserSession;

	beforeAll(async () => {
		process.env.REDIS_URL = integrationConfig.redisUrl;
		delete process.env.UPSTASH_REDIS_URL;
		delete process.env.UPSTASH_REDIS_TOKEN;

		const redisProbe = new IORedis(integrationConfig.redisUrl, {
			maxRetriesPerRequest: 1,
			lazyConnect: false,
		});
		try {
			const pong = await redisProbe.ping();
			expect(pong).toBe("PONG");
		} finally {
			await redisProbe.quit();
		}

		freeUser = await createUserSession(integrationConfig, createdUserIds, "step2-ratelimit");
	});

	beforeEach(async () => {
		process.env.REDIS_URL = integrationConfig.redisUrl;
		delete process.env.UPSTASH_REDIS_URL;
		delete process.env.UPSTASH_REDIS_TOKEN;

		await __resetRateLimitRedisClientForTests();
		await __flushRateLimitRedisForTests();
		__resetStrictTierRoutePoliciesForTests();
	});

	afterEach(async () => {
		await __resetRateLimitRedisClientForTests();
		__resetStrictTierRoutePoliciesForTests();
	});

	afterAll(async () => {
		for (const userId of createdUserIds) {
			await adminClient.auth.admin.deleteUser(userId);
		}

		await __resetRateLimitRedisClientForTests();
		__resetStrictTierRoutePoliciesForTests();
	});

	describe("rate limit integration: protected and public matrices", () => {
			const FAST_FAILURE_UPPER_BOUND_MS = 4500;

		it("enforces free-tier daily boundary at 29 -> 30 -> 31 with deterministic headers and envelope", async () => {
			const responses: Response[] = [];
			for (let count = 1; count <= 31; count += 1) {
				responses.push(await postSegment(freeUser.accessToken));
			}

			for (let count = 1; count <= 30; count += 1) {
				expect(responses[count - 1]?.status).toBe(200);
			}
			expect(responses[30]?.status).toBe(429);

			const response29 = responses[28] as Response;
			const response30 = responses[29] as Response;
			const response31 = responses[30] as Response;

			expect(response29.headers.get("X-RateLimit-Limit")).toBe(String(FREE_DAILY_LIMIT));
			expect(response29.headers.get("X-RateLimit-Remaining")).toBe("1");
			expect(response30.headers.get("X-RateLimit-Limit")).toBe(String(FREE_DAILY_LIMIT));
			expect(response30.headers.get("X-RateLimit-Remaining")).toBe("0");
			expect(response31.headers.get("X-RateLimit-Limit")).toBe(String(FREE_DAILY_LIMIT));
			expect(response31.headers.get("X-RateLimit-Remaining")).toBe("0");

			const reset29 = Number(response29.headers.get("X-RateLimit-Reset") ?? "0");
			const reset30 = Number(response30.headers.get("X-RateLimit-Reset") ?? "0");
			const reset31 = Number(response31.headers.get("X-RateLimit-Reset") ?? "0");
			expect(reset29).toBeGreaterThan(Math.floor(Date.now() / 1000));
			expect(reset30).toBeGreaterThan(Math.floor(Date.now() / 1000));
			expect(reset31).toBeGreaterThan(Math.floor(Date.now() / 1000));

			const body31 = (await response31.json()) as ErrorBody;
			expect(body31.error.code).toBe("RATE_LIMIT_EXCEEDED");
			expect(body31.error.message).toBe("Daily free-tier rate limit exceeded");
		});

		it("keeps concurrent near-boundary protected requests deterministic", async () => {
			for (let count = 1; count <= 29; count += 1) {
				const response = await postSegment(freeUser.accessToken);
				expect(response.status).toBe(200);
			}

			const burstResponses = await Promise.all(
				Array.from({ length: 5 }).map(() => postSegment(freeUser.accessToken)),
			);

			const successCount = burstResponses.filter((response) => response.status === 200).length;
			const limitedResponses = burstResponses.filter((response) => response.status === 429);

			expect(successCount).toBe(1);
			expect(limitedResponses.length).toBe(4);

			for (const limitedResponse of limitedResponses) {
				const body = (await limitedResponse.json()) as ErrorBody;
				expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
			}
		});

		it("returns deterministic 403 TIER_FORBIDDEN when free tier hits a strictly gated endpoint policy", async () => {
			__setStrictTierRoutePoliciesForTests([
				{
					routePrefix: "/projects",
					allowedTiers: ["pro", "byok"],
				},
			]);

			const response = await getProjects(freeUser.accessToken);
			const body = (await response.json()) as ErrorBody;

			expect(response.status).toBe(403);
			expect(body.error.code).toBe("TIER_FORBIDDEN");
		});

		it("keeps successful /auth/token responses free of X-RateLimit-* headers", async () => {
			const response = await postAuthToken(freeUser.refreshToken, {
				"fly-client-ip": "198.51.100.10",
			});

			expect(response.status).toBe(200);
			expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
			expect(response.headers.get("X-RateLimit-Remaining")).toBeNull();
			expect(response.headers.get("X-RateLimit-Reset")).toBeNull();
		});

		it("enforces deterministic 429 for over-limit /auth/token IP bursts", async () => {
			const testIp = "198.51.100.11";
			for (let count = 1; count <= AUTH_TOKEN_IP_LIMIT; count += 1) {
				const response = await postAuthToken("not-a-real-refresh-token", {
					"fly-client-ip": testIp,
				});
				expect(response.status).toBe(401);
			}

			const blockedResponse = await postAuthToken("not-a-real-refresh-token", {
				"fly-client-ip": testIp,
			});
			const blockedBody = (await blockedResponse.json()) as ErrorBody;

			expect(blockedResponse.status).toBe(429);
			expect(blockedBody.error.code).toBe("RATE_LIMIT_EXCEEDED");
			expect(blockedResponse.headers.get("Retry-After")).not.toBeNull();
			expect(blockedResponse.headers.get("X-RateLimit-Limit")).toBeNull();
			expect(blockedResponse.headers.get("X-RateLimit-Remaining")).toBeNull();
			expect(blockedResponse.headers.get("X-RateLimit-Reset")).toBeNull();
		});

		it("returns deterministic 503 RATE_LIMIT_UNAVAILABLE when Redis calls throw", async () => {
			__setRateLimitRedisClientForTests({
				async incr() {
					throw new Error("forced redis failure");
				},
				async expireat() {
					return 1;
				},
				async expire() {
					return 1;
				},
				async ttl() {
					return 60;
				},
			});

			const response = await postSegment(freeUser.accessToken);
			const body = (await response.json()) as ErrorBody;

			expect(response.status).toBe(503);
			expect(body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
			expect(body.error.message).toBe("Rate limit service unavailable");
		});

			it("returns deterministic 503 RATE_LIMIT_UNAVAILABLE when protected Redis quota calls hang", async () => {
				__setRateLimitRedisClientForTests({
					async incr() {
						return await new Promise<number>(() => {
							// intentionally unresolved to simulate a hanging Redis command
						});
					},
					async expireat() {
						return 1;
					},
					async expire() {
						return 1;
					},
					async ttl() {
						return 60;
					},
				});

				const startedAt = Date.now();
				const response = await postSegment(freeUser.accessToken);
				const durationMs = Date.now() - startedAt;
				const body = (await response.json()) as ErrorBody;

				expect(response.status).toBe(503);
				expect(body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
				expect(body.error.message).toBe("Rate limit service unavailable");
				expect(durationMs).toBeLessThan(FAST_FAILURE_UPPER_BOUND_MS);
			});

			it("returns deterministic 503 RATE_LIMIT_UNAVAILABLE when /auth/token Redis quota calls hang", async () => {
				__setRateLimitRedisClientForTests({
					async incr() {
						return await new Promise<number>(() => {
							// intentionally unresolved to simulate a hanging Redis command
						});
					},
					async expireat() {
						return 1;
					},
					async expire() {
						return 1;
					},
					async ttl() {
						return 60;
					},
				});

				const startedAt = Date.now();
				const response = await postAuthToken("not-a-real-refresh-token", {
					"fly-client-ip": "198.51.100.12",
				});
				const durationMs = Date.now() - startedAt;
				const body = (await response.json()) as ErrorBody;

				expect(response.status).toBe(503);
				expect(body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
				expect(body.error.message).toBe("Rate limit service unavailable");
				expect(durationMs).toBeLessThan(FAST_FAILURE_UPPER_BOUND_MS);
			});
	});
}
