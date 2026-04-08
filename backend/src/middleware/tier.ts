import type { MiddlewareHandler } from "hono";

import { userTierHeaderSchema } from "../lib/schemas";
import { parseWithSchema } from "../lib/validation";

export const tierMiddleware: MiddlewareHandler = async (c, next) => {
	const parsed = parseWithSchema(userTierHeaderSchema, {
		"x-user-tier": c.req.header("x-user-tier") ?? undefined,
	});

	if (!parsed.ok) {
		return c.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Invalid x-user-tier header",
					details: [
						{
							path: "x-user-tier",
							message: "Allowed values are free, pro, or byok",
						},
					],
				},
			},
			400,
		);
	}

	c.set("tier", parsed.data["x-user-tier"] ?? "free");
	await next();
};

