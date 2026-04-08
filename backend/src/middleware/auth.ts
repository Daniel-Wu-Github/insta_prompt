import type { MiddlewareHandler } from "hono";

import { authHeaderSchema } from "../lib/schemas";
import { parseWithSchema } from "../lib/validation";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
	const parsed = parseWithSchema(authHeaderSchema, {
		authorization: c.req.header("Authorization") ?? "",
	});

	if (!parsed.ok) {
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

	const bearerValue = parsed.data.authorization.replace("Bearer ", "").trim();
	if (bearerValue.length === 0) {
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

	c.set("userId", "dev-user");
	await next();
};

