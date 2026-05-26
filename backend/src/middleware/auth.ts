import type { Context, MiddlewareHandler } from "hono";

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
	const authHeader = c.req.header("Authorization");

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return unauthorizedResponse(c);
	}

	const bearerValue = authHeader.slice("Bearer ".length).trim();
	if (bearerValue.length === 0) {
		return unauthorizedResponse(c);
	}

	const verifiedAuth = await verifyBearerToken(bearerValue);
	if (!verifiedAuth.ok) {
		return unauthorizedResponse(c);
	}

	c.set("userId", verifiedAuth.data.userId);
	c.set("tier", verifiedAuth.data.tier);
	await next();
};

