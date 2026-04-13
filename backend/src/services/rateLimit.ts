import { Redis } from "@upstash/redis";

export const FREE_DAILY_LIMIT = 30;
export const AUTH_TOKEN_IP_LIMIT = 20;
export const AUTH_TOKEN_IP_WINDOW_SECONDS = 60;

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

let cachedRedisClient: Redis | null | undefined;

function getNextUtcMidnightEpochSeconds(now: Date): number {
	return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) / 1000);
}

function buildDailyQuotaKey(userId: string): string {
	return `rate:daily:${userId}`;
}

function buildAuthTokenIpQuotaKey(clientIp: string): string {
	return `rate:auth-token-ip:${encodeURIComponent(clientIp)}`;
}

function resolveRedisClient(): Redis | null {
	if (cachedRedisClient !== undefined) {
		return cachedRedisClient;
	}

	const url = process.env.UPSTASH_REDIS_URL?.trim() ?? "";
	const redisAuthValue = process.env.UPSTASH_REDIS_TOKEN?.trim() ?? "";
	if (url.length === 0 || redisAuthValue.length === 0) {
		cachedRedisClient = null;
		return cachedRedisClient;
	}

	cachedRedisClient = new Redis({
		url,
		token: redisAuthValue,
	});

	return cachedRedisClient;
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
		const used = await redis.incr(key);
		if (used === 1) {
			await redis.expireat(key, reset);
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
		const used = await redis.incr(key);
		if (used === 1) {
			await redis.expire(key, AUTH_TOKEN_IP_WINDOW_SECONDS);
		} else {
			const ttl = await redis.ttl(key);
			if (typeof ttl === "number" && ttl > 0) {
				reset = nowSeconds + ttl;
			} else {
				await redis.expire(key, AUTH_TOKEN_IP_WINDOW_SECONDS);
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
