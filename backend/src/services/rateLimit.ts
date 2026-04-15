import { Redis as UpstashRedis } from "@upstash/redis";
import { Redis as IORedis } from "ioredis";

export const FREE_DAILY_LIMIT = 30;
export const AUTH_TOKEN_IP_LIMIT = 20;
export const AUTH_TOKEN_IP_WINDOW_SECONDS = 60;
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 2000;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 2000;

const REDIS_CONNECT_TIMEOUT_MS = readPositiveIntEnv("RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS", DEFAULT_REDIS_CONNECT_TIMEOUT_MS);
const REDIS_COMMAND_TIMEOUT_MS = readPositiveIntEnv("RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS", DEFAULT_REDIS_COMMAND_TIMEOUT_MS);

type RateLimitRedisClient = {
	incr: (key: string) => Promise<number>;
	expireat: (key: string, unixSeconds: number) => Promise<number>;
	expire: (key: string, seconds: number) => Promise<number>;
	ttl: (key: string) => Promise<number>;
	flushdb?: () => Promise<void>;
	close?: () => Promise<void>;
};

type DailyQuotaSuccess = {
	ok: true;
	limit: number;
	used: number;
	remaining: number;
	reset: number;
	exceeded: boolean;
};

type RateLimitUnavailable = {
	ok: false;
	code: "RATE_LIMIT_UNAVAILABLE";
	message: string;
};

type AuthTokenIpQuotaSuccess = {
	ok: true;
	limit: number;
	used: number;
	remaining: number;
	reset: number;
	retryAfter: number;
	exceeded: boolean;
};

export type DailyQuotaResult = DailyQuotaSuccess | RateLimitUnavailable;
export type AuthTokenIpQuotaResult = AuthTokenIpQuotaSuccess | RateLimitUnavailable;

let cachedRedisClient: RateLimitRedisClient | null | undefined;
let testOverrideRedisClient: RateLimitRedisClient | null | undefined;

function readPositiveIntEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function withRedisTimeout<T>(operation: Promise<T>, operationName: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error(`Redis ${operationName} timed out after ${REDIS_COMMAND_TIMEOUT_MS}ms`));
		}, REDIS_COMMAND_TIMEOUT_MS);

		operation
			.then((value) => {
				clearTimeout(timeoutId);
				resolve(value);
			})
			.catch((error: unknown) => {
				clearTimeout(timeoutId);
				reject(error);
			});
	});
}

function getNextUtcMidnightEpochSeconds(now: Date): number {
	return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) / 1000);
}

function buildDailyQuotaKey(userId: string): string {
	return `rate:daily:${userId}`;
}

function buildAuthTokenIpQuotaKey(clientIp: string): string {
	return `rate:auth-token-ip:${encodeURIComponent(clientIp)}`;
}

function createLocalRedisClient(redisUrl: string): RateLimitRedisClient {
	const redis = new IORedis(redisUrl, {
		connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
		commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
		maxRetriesPerRequest: 1,
	});

	return {
		async incr(key) {
			return await redis.incr(key);
		},
		async expireat(key, unixSeconds) {
			return await redis.expireat(key, unixSeconds);
		},
		async expire(key, seconds) {
			return await redis.expire(key, seconds);
		},
		async ttl(key) {
			return await redis.ttl(key);
		},
		async flushdb() {
			await redis.flushdb();
		},
		async close() {
			try {
				await redis.quit();
			} catch {
				redis.disconnect();
			}
		},
	};
}

function createUpstashRedisClient(url: string, redisTokenValue: string): RateLimitRedisClient {
	const redis = new UpstashRedis({
		url,
		token: redisTokenValue,
	});

	return {
		async incr(key) {
			return await redis.incr(key);
		},
		async expireat(key, unixSeconds) {
			return await redis.expireat(key, unixSeconds);
		},
		async expire(key, seconds) {
			return await redis.expire(key, seconds);
		},
		async ttl(key) {
			return await redis.ttl(key);
		},
	};
}

function resolveRedisClient(): RateLimitRedisClient | null {
	if (testOverrideRedisClient !== undefined) {
		return testOverrideRedisClient;
	}

	if (cachedRedisClient !== undefined) {
		return cachedRedisClient;
	}

	const localRedisUrl = process.env.REDIS_URL?.trim() ?? "";
	if (localRedisUrl.length > 0) {
		cachedRedisClient = createLocalRedisClient(localRedisUrl);
		return cachedRedisClient;
	}

	const url = process.env.UPSTASH_REDIS_URL?.trim() ?? "";
	const redisAuthValue = process.env.UPSTASH_REDIS_TOKEN?.trim() ?? "";
	if (url.length === 0 || redisAuthValue.length === 0) {
		cachedRedisClient = null;
		return cachedRedisClient;
	}

	cachedRedisClient = createUpstashRedisClient(url, redisAuthValue);

	return cachedRedisClient;
}

export function __setRateLimitRedisClientForTests(client: RateLimitRedisClient | null | undefined): void {
	testOverrideRedisClient = client;
	cachedRedisClient = undefined;
}

export async function __resetRateLimitRedisClientForTests(): Promise<void> {
	testOverrideRedisClient = undefined;
	const existingClient = cachedRedisClient;
	cachedRedisClient = undefined;

	if (existingClient?.close) {
		await existingClient.close();
	}
}

export async function __flushRateLimitRedisForTests(): Promise<void> {
	const redis = resolveRedisClient();
	if (redis?.flushdb) {
		await redis.flushdb();
	}
}

function unavailableResult(): RateLimitUnavailable {
	return {
		ok: false,
		code: "RATE_LIMIT_UNAVAILABLE",
		message: "Rate limit service unavailable",
	};
}

function epochSeconds(now: Date): number {
	return Math.floor(now.getTime() / 1000);
}

export async function consumeDailyFreeQuota(userId: string, now = new Date()): Promise<DailyQuotaResult> {
	const redis = resolveRedisClient();
	if (!redis) {
		return unavailableResult();
	}

	const key = buildDailyQuotaKey(userId);
	const reset = getNextUtcMidnightEpochSeconds(now);

	try {
		const used = await withRedisTimeout(redis.incr(key), "incr");
		if (used === 1) {
			await withRedisTimeout(redis.expireat(key, reset), "expireat");
		}

		const remaining = Math.max(0, FREE_DAILY_LIMIT - used);

		return {
			ok: true,
			limit: FREE_DAILY_LIMIT,
			used,
			remaining,
			reset,
			exceeded: used > FREE_DAILY_LIMIT,
		};
	} catch (error) {
		console.error("Rate limit Redis call failed", error);
		return unavailableResult();
	}
}

export async function consumeAuthTokenIpQuota(clientIp: string, now = new Date()): Promise<AuthTokenIpQuotaResult> {
	const redis = resolveRedisClient();
	if (!redis) {
		return unavailableResult();
	}

	const key = buildAuthTokenIpQuotaKey(clientIp);
	const nowSeconds = epochSeconds(now);
	let reset = nowSeconds + AUTH_TOKEN_IP_WINDOW_SECONDS;

	try {
		const used = await withRedisTimeout(redis.incr(key), "incr");
		if (used === 1) {
			await withRedisTimeout(redis.expire(key, AUTH_TOKEN_IP_WINDOW_SECONDS), "expire");
		} else {
			const ttl = await withRedisTimeout(redis.ttl(key), "ttl");
			if (typeof ttl === "number" && ttl > 0) {
				reset = nowSeconds + ttl;
			} else {
				await withRedisTimeout(redis.expire(key, AUTH_TOKEN_IP_WINDOW_SECONDS), "expire");
			}
		}

		const remaining = Math.max(0, AUTH_TOKEN_IP_LIMIT - used);

		return {
			ok: true,
			limit: AUTH_TOKEN_IP_LIMIT,
			used,
			remaining,
			reset,
			retryAfter: Math.max(1, reset - nowSeconds),
			exceeded: used > AUTH_TOKEN_IP_LIMIT,
		};
	} catch (error) {
		console.error("Auth token IP rate limit Redis call failed", error);
		return unavailableResult();
	}
}
