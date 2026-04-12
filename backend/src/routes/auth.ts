import { Hono } from "hono";

import type { AuthTokenResponse } from "../../../shared/contracts";
import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { authTokenRequestSchema } from "../lib/schemas";
import { refreshAndVerifySession } from "../services/supabase";
import { parseWithSchema } from "../lib/validation";

export const authRoutes = new Hono();

authRoutes.post("/token", async (c) => {
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

