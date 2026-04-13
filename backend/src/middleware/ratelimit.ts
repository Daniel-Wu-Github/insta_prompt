import type { MiddlewareHandler } from "hono";

import { consumeDailyFreeQuota } from "../services/rateLimit";

const LLM_QUOTA_PREFIXES = ["/segment", "/enhance", "/bind"] as const;

function isQuotaProtectedPath(path: string): boolean {
	return LLM_QUOTA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
	if (!isQuotaProtectedPath(c.req.path)) {
		await next();
		return;
	}

	if (c.get("tier") !== "free") {
		await next();
		return;
	}

	const quota = await consumeDailyFreeQuota(c.get("userId"));
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

	await next();
};

