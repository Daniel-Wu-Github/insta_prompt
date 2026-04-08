import { Hono } from "hono";

import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { authTokenRequestSchema } from "../lib/schemas";
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

	return c.json({
		token: "dev-token",
		token_type: "bearer",
		expires_in: 3600,
		refresh_token: parsed.data.refresh_token ?? null,
	});
});

