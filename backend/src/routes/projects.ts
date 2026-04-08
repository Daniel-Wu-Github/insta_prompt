import { Hono } from "hono";

import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { projectContextRequestSchema, projectIdParamSchema } from "../lib/schemas";
import { parseWithSchema } from "../lib/validation";

export const projectRoutes = new Hono();

projectRoutes.get("/", (c) => {
	return c.json({ projects: [] });
});

projectRoutes.post("/:id/context", async (c) => {
	const params = parseWithSchema(projectIdParamSchema, c.req.param());
	if (!params.ok) {
		return zodValidationErrorResponse(c, params.error);
	}

	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(projectContextRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	return c.json({
		project_id: params.data.id,
		ingested_chunks: parsed.data.chunks.length,
		status: "accepted",
	});
});

