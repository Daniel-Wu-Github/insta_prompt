import type { MiddlewareHandler } from "hono";

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
	c.header("X-RateLimit-Limit", "30");
	c.header("X-RateLimit-Remaining", "30");
	await next();
};

