import { Hono, type Context } from "hono";

import type { AuthTokenResponse } from "../../../shared/contracts";
import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { authTokenRequestSchema } from "../lib/schemas";
import { consumeAuthTokenIpQuota } from "../services/rateLimit";
import { refreshAndVerifySession } from "../services/supabase";
import { parseWithSchema } from "../lib/validation";

export const authRoutes = new Hono();

const UNKNOWN_CLIENT_IP_KEY = "unknown-client-ip";

function extractTrustedClientIp(c: Context): string {
	const flyClientIp = c.req.header("fly-client-ip")?.trim();
	if (flyClientIp && flyClientIp.length > 0) {
		return flyClientIp;
	}

	const xForwardedFor = c.req.header("x-forwarded-for");
	if (xForwardedFor && xForwardedFor.length > 0) {
		const firstHop = xForwardedFor.split(",")[0]?.trim();
		if (firstHop && firstHop.length > 0) {
			return firstHop;
		}
	}

	return UNKNOWN_CLIENT_IP_KEY;
}

authRoutes.post("/token", async (c) => {
	const clientIp = extractTrustedClientIp(c);
	const ipQuota = await consumeAuthTokenIpQuota(clientIp);
	if (!ipQuota.ok) {
		return c.json(
			{
				error: {
					code: ipQuota.code,
					message: ipQuota.message,
				},
			},
			503,
		);
	}

	if (ipQuota.exceeded) {
		c.header("Retry-After", String(ipQuota.retryAfter));
		return c.json(
			{
				error: {
					code: "RATE_LIMIT_EXCEEDED",
					message: "Too many requests",
				},
			},
			429,
		);
	}

	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(authTokenRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	const refreshed = await refreshAndVerifySession(parsed.data.refresh_token);
	if (!refreshed.ok) {
		return c.json(
			{
				error: {
					code: refreshed.code,
					message: refreshed.message,
				},
			},
			refreshed.status,
		);
	}

	const response: AuthTokenResponse = refreshed.data;

	return c.json(response);
});

