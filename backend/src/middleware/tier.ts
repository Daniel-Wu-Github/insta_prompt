import type { MiddlewareHandler } from "hono";

export const tierMiddleware: MiddlewareHandler = async (c, next) => {
	const tier = c.get("tier");
	if (!tier) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Missing or invalid Authorization header",
				},
			},
			401,
		);
	}

	await next();
};

