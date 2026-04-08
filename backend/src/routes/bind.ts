import { Hono } from "hono";

import type { StreamEvent } from "../../../shared/contracts";
import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { bindRequestSchema } from "../lib/schemas";
import { streamFromEvents } from "../lib/sse";
import { parseWithSchema } from "../lib/validation";

function toTokenEvents(text: string): StreamEvent[] {
	const events: StreamEvent[] = text
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => ({ type: "token", data: `${token} ` }));

	events.push({ type: "done" });
	return events;
}

export const bindRoutes = new Hono();

bindRoutes.post("/", async (c) => {
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
});

