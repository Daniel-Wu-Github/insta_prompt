import type { Context, MiddlewareHandler } from "hono";

import { authHeaderSchema } from "../lib/schemas";
import { parseWithSchema } from "../lib/validation";
import { verifyBearerToken } from "../services/supabase";

function unauthorizedResponse(c: Context) {
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

export const authMiddleware: MiddlewareHandler = async (c, next) => {
	const parsed = parseWithSchema(authHeaderSchema, {
		authorization: c.req.header("Authorization") ?? "",
	});

	if (!parsed.ok) {
		return unauthorizedResponse(c);
	}

	const bearerValue = parsed.data.authorization.replace("Bearer ", "").trim();
	if (bearerValue.length === 0) {
		return unauthorizedResponse(c);
	}

	const verifiedAuth = await verifyBearerToken(bearerValue);
	if (!verifiedAuth) {
		return unauthorizedResponse(c);
	}

	c.set("userId", verifiedAuth.userId);
	c.set("tier", verifiedAuth.tier);
	await next();
};

