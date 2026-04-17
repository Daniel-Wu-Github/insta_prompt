import type { Context } from "hono";

import type { Tier } from "../../../shared/contracts";
import type { StreamEvent } from "../../../shared/contracts";
import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { bindRequestSchema, enhanceRequestSchema, segmentRequestSchema, segmentResponseSchema } from "../lib/schemas";
import { streamFromEvents } from "../lib/sse";
import { parseWithSchema } from "../lib/validation";
import { fetchProjectContext } from "./context";
import { selectModel } from "./llm";
import {
	classifySegmentsFromStreamingAdapter,
	normalizeIncomingSegments,
	normalizeSegmentClassificationIntermediate,
} from "./segment";

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

	const normalizedSegments = normalizeIncomingSegments(parsed.data.segments);
	if (normalizedSegments.length === 0) {
		return validationErrorResponse(c, "segments must include at least one non-empty string");
	}

	const model = selectModel({
		callType: "segment",
		tier: c.get("tier") as Tier,
		mode: parsed.data.mode,
	});

	const classifiedIntermediate = await classifySegmentsFromStreamingAdapter({
		segments: normalizedSegments,
		model,
		signal: c.req.raw.signal,
	});

	const response = normalizeSegmentClassificationIntermediate(classifiedIntermediate);

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