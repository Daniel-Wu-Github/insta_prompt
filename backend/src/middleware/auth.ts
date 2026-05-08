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
	console.log("1. Raw Authorization Header:", authHeader);
	console.log("2. Header Length:", authHeader?.length ?? 0);

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		console.log("3. FAILED: Missing Bearer token or malformed Authorization header");
		return unauthorizedResponse(c);
	}

	const bearerValue = authHeader.slice("Bearer ".length).trim();
	if (bearerValue.length === 0) {
		console.log("3. FAILED: Empty bearer token after prefix removal");
		return unauthorizedResponse(c);
	}

	console.log("4. Extracted Token Prefix:", bearerValue.slice(0, 10));

	const verifiedAuth = await verifyBearerToken(bearerValue);
	if (!verifiedAuth.ok) {
		console.log("5. SUPABASE REJECTION:", verifiedAuth.reason);
		return unauthorizedResponse(c);
	}

	console.log("6. SUCCESS: User ID:", verifiedAuth.data.userId);

	c.set("userId", verifiedAuth.data.userId);
	c.set("tier", verifiedAuth.data.tier);
	await next();
};

