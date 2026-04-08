import { Hono } from "hono";

import type { StreamEvent } from "../../../shared/contracts";
import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { enhanceRequestSchema } from "../lib/schemas";
import { streamFromEvents } from "../lib/sse";
import { parseWithSchema } from "../lib/validation";
import { fetchProjectContext } from "../services/context";

function toTokenEvents(text: string): StreamEvent[] {
	const events: StreamEvent[] = text
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => ({ type: "token", data: `${token} ` }));

	events.push({ type: "done" });
	return events;
}

export const enhanceRoutes = new Hono();

enhanceRoutes.post("/", async (c) => {
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
});

