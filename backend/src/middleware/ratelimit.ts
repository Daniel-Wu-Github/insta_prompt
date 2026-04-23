import type { MiddlewareHandler } from "hono";

import type { AbuseSignalRecord, AbuseSignalType } from "../services/history";
import { captureRateLimitAbuseSignal } from "../services/history";
import { consumeDailyFreeQuota, consumeProtectedRouteBurstQuota } from "../services/rateLimit";

const LLM_QUOTA_PREFIXES = ["/segment", "/enhance", "/bind"] as const;

function isQuotaProtectedPath(path: string): boolean {
	return LLM_QUOTA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function captureAbuseSignalNonBlocking(record: AbuseSignalRecord): void {
	try {
		void captureRateLimitAbuseSignal(record).catch((error) => {
			console.warn("[observability][abuse_signal] capture failed", error);
		});
	} catch (error) {
		console.warn("[observability][abuse_signal] capture failed", error);
	}
}

function buildAbuseSignalRecord(args: {
	signal: AbuseSignalType;
	userId: string;
	tier: string;
	route: string;
	limit: number;
	used: number;
	remaining: number;
	windowSeconds: number;
	reset: number;
	retryAfter: number;
}): AbuseSignalRecord {
	return {
		signal: args.signal,
		userId: args.userId,
		tier: args.tier,
		route: args.route,
		limit: args.limit,
		used: args.used,
		remaining: args.remaining,
		window_seconds: args.windowSeconds,
		reset: args.reset,
		retry_after: args.retryAfter,
		created_at: new Date().toISOString(),
	};
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
	if (!isQuotaProtectedPath(c.req.path)) {
		await next();
		return;
	}

	const userId = c.get("userId");
	const tier = c.get("tier");
	if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
		return c.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Rate limit user context is missing",
				},
			},
			500,
		);
	}

	if (tier === "free") {
		const quota = await consumeDailyFreeQuota(userId);
		if (!quota.ok) {
			return c.json(
				{
					error: {
						code: "RATE_LIMIT_UNAVAILABLE",
						message: "Rate limit service unavailable",
					},
				},
				503,
			);
		}

		c.header("X-RateLimit-Limit", String(quota.limit));
		c.header("X-RateLimit-Remaining", String(quota.remaining));
		c.header("X-RateLimit-Reset", String(quota.reset));

		if (quota.exceeded) {
			return c.json(
				{
					error: {
						code: "RATE_LIMIT_EXCEEDED",
						message: "Daily free-tier rate limit exceeded",
					},
				},
				429,
			);
		}
	}

	const burst = await consumeProtectedRouteBurstQuota(userId);
	if (!burst.ok) {
		return c.json(
			{
				error: {
					code: "RATE_LIMIT_UNAVAILABLE",
					message: "Rate limit service unavailable",
				},
			},
			503,
		);
	}

	if (burst.exceeded) {
		captureAbuseSignalNonBlocking(
			buildAbuseSignalRecord({
				signal: "burst_limit_exceeded",
				userId,
				tier,
				route: c.req.path,
				limit: burst.limit,
				used: burst.used,
				remaining: burst.remaining,
				windowSeconds: burst.windowSeconds,
				reset: burst.reset,
				retryAfter: burst.retryAfter,
			}),
		);

		c.header("Retry-After", String(burst.retryAfter));
		return c.json(
			{
				error: {
					code: "RATE_LIMIT_EXCEEDED",
					message: "Burst rate limit exceeded",
				},
			},
			429,
		);
	}

	if (burst.nearThreshold) {
		captureAbuseSignalNonBlocking(
			buildAbuseSignalRecord({
				signal: "burst_threshold_approached",
				userId,
				tier,
				route: c.req.path,
				limit: burst.limit,
				used: burst.used,
				remaining: burst.remaining,
				windowSeconds: burst.windowSeconds,
				reset: burst.reset,
				retryAfter: burst.retryAfter,
			}),
		);
	}

	await next();
};

