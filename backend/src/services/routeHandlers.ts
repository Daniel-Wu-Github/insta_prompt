import type { Context } from "hono";

import type { StreamEvent } from "../../../shared/contracts";
import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { bindRequestSchema, enhanceRequestSchema, segmentRequestSchema, segmentResponseSchema } from "../lib/schemas";
import { streamFromEvents } from "../lib/sse";
import { parseWithSchema } from "../lib/validation";
import { fetchProjectContext } from "./context";

const ACTION_ORDER = 4;

function toTokenEvents(text: string): StreamEvent[] {
	const events: StreamEvent[] = text
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => ({ type: "token", data: `${token} ` }));

	events.push({ type: "done" });
	return events;
}

export async function segmentRouteHandler(c: Context) {
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
}

export async function enhanceRouteHandler(c: Context) {
	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(enhanceRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	const context = await fetchProjectContext(parsed.data.project_id);
	const siblingCount = parsed.data.siblings.length;
	const expanded = `Step 0 placeholder expansion (${parsed.data.mode}) for section ${parsed.data.section.id}: ${parsed.data.section.text}. Siblings=${siblingCount}.${context ? ` Context=${context}.` : ""}`;

	return c.newResponse(streamFromEvents(toTokenEvents(expanded)), 200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
}

export async function bindRouteHandler(c: Context) {
	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(bindRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	const ordered = [...parsed.data.sections].sort((a, b) => a.canonical_order - b.canonical_order);
	const finalPrompt = ordered.map((section) => section.expansion.trim()).join("\n\n");

	return c.newResponse(streamFromEvents(toTokenEvents(finalPrompt)), 200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
}