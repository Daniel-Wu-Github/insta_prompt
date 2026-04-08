import { Hono } from "hono";

import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { segmentRequestSchema, segmentResponseSchema } from "../lib/schemas";
import { parseWithSchema } from "../lib/validation";

const ACTION_ORDER = 4;

export const segmentRoutes = new Hono();

segmentRoutes.post("/", async (c) => {
	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(segmentRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	const response = {
		sections: parsed.data.segments.map((segment, index) => ({
			id: `s${index + 1}`,
			text: segment,
			goal_type: "action" as const,
			canonical_order: ACTION_ORDER,
			confidence: 0.5,
			depends_on: [] as string[],
		})),
	};

	const responseCheck = parseWithSchema(segmentResponseSchema, response);
	if (!responseCheck.ok) {
		return c.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Segment response failed schema validation",
				},
			},
			500,
		);
	}

	return c.json(responseCheck.data);
});

