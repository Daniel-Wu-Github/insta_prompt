import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "bun:test";

import type { ModelConfig } from "../services/llm";
import type { ProviderStreamEvent, ProviderStreamingAdapter } from "../services/providers";
import {
	__resetSegmentProviderAdapterOverridesForTests,
	__setSegmentProviderAdapterOverrideForTests,
	classifySegmentsFromStreamingAdapter,
	normalizeIncomingSegments,
	normalizeSegmentClassificationIntermediate,
	type SegmentClassificationIntermediate,
} from "../services/segment";

const SEGMENT_MODEL: ModelConfig = {
	provider: "groq",
	model: "llama-3.1-8b-instant",
	maxTokens: 500,
};

function deriveExpectedStableId(text: string, occurrenceCount: number): string {
	const digest = createHash("sha256")
		.update(`${text}\u0000${occurrenceCount}`, "utf8")
		.digest("hex")
		.slice(0, 24);

	return `s_${digest}`;
}

function createStreamingAdapter(eventsPerCall: readonly ProviderStreamEvent[][]): ProviderStreamingAdapter {
	let callCount = 0;

	return {
		provider: "groq",
		async *stream() {
			const eventIndex = Math.min(callCount, Math.max(eventsPerCall.length - 1, 0));
			const events = eventsPerCall[eventIndex] ?? [];
			callCount += 1;

			for (const event of events) {
				yield event;
			}
		},
	};
}

function createThrowingAdapter(error: Error): ProviderStreamingAdapter {
	return {
		provider: "groq",
		async *stream() {
			throw error;
		},
	};
}

function toStreamingJsonEvents(payload: unknown, chunkSize = 64): ProviderStreamEvent[] {
	const text = JSON.stringify(payload);
	if (text.length === 0) {
		return [{ type: "done" }];
	}

	const events: ProviderStreamEvent[] = [];
	for (let index = 0; index < text.length; index += chunkSize) {
		events.push({
			type: "token",
			content: text.slice(index, index + chunkSize),
		});
	}

	events.push({ type: "done" });
	return events;
}

describe("segment service", () => {
	afterEach(() => {
		__resetSegmentProviderAdapterOverridesForTests();
	});

	it("normalizes taxonomy labels, canonical order, confidence, and trimmed text", () => {
		const intermediate: SegmentClassificationIntermediate = {
			sections: [
				{
					text: "  keep context  ",
					goal_type: "Background",
					canonical_order: 6,
					confidence: 1.9,
					depends_on: [],
				},
				{
					text: "use framework",
					goal_type: "Framework",
					canonical_order: 1,
					confidence: -0.5,
					depends_on: [],
				},
				{
					text: "format output",
					goal_type: "Output Format",
					canonical_order: 3,
					depends_on: [],
				},
				{
					text: "unknown label",
					goal_type: "not-a-taxonomy-label",
					canonical_order: 2,
					confidence: "n/a",
					depends_on: [],
				},
			],
		};

		const normalized = normalizeSegmentClassificationIntermediate(intermediate);

		expect(normalized.sections.map((section) => section.text)).toEqual([
			"keep context",
			"use framework",
			"format output",
			"unknown label",
		]);
		expect(normalized.sections.map((section) => section.goal_type)).toEqual([
			"context",
			"tech_stack",
			"output_format",
			"action",
		]);
		expect(normalized.sections.map((section) => section.canonical_order)).toEqual([1, 2, 5, 4]);
		expect(normalized.sections.map((section) => section.confidence)).toEqual([1, 0, 0.5, 0.5]);
	});

	it("trims and filters incoming segments before classification", () => {
		expect(normalizeIncomingSegments(["  keep me  ", "", "   ", "and me\n"])).toEqual([
			"keep me",
			"and me",
		]);
	});

	it("generates deterministic stable ids from text + occurrence count", () => {
		const intermediate: SegmentClassificationIntermediate = {
			sections: [
				{
					text: "repeat",
					goal_type: "context",
				},
				{
					text: "repeat",
					goal_type: "context",
				},
				{
					text: "unique",
					goal_type: "context",
				},
			],
		};

		const first = normalizeSegmentClassificationIntermediate(intermediate);
		const second = normalizeSegmentClassificationIntermediate(intermediate);

		expect(first.sections.map((section) => section.id)).toEqual([
			deriveExpectedStableId("repeat", 0),
			deriveExpectedStableId("repeat", 1),
			deriveExpectedStableId("unique", 0),
		]);
		expect(first.sections.map((section) => section.id)).toEqual(second.sections.map((section) => section.id));
		expect(first.sections[0]?.id).not.toBe(first.sections[1]?.id);
	});

	it("translates integer dependency indices to ids and sanitizes invalid/self/duplicate/cycle edges", () => {
		const intermediate: SegmentClassificationIntermediate = {
			sections: [
				{
					text: "A",
					goal_type: "context",
					depends_on: [0, 1, 1, 99, -1, "x"],
				},
				{
					text: "A",
					goal_type: "action",
					depends_on: [2, 2],
				},
				{
					text: "B",
					goal_type: "constraint",
					depends_on: [1],
				},
			],
		};

		const normalized = normalizeSegmentClassificationIntermediate(intermediate);
		const [first, second, third] = normalized.sections;

		if (!first || !second || !third) {
			throw new Error("Expected three normalized sections");
		}

		expect(first.depends_on).toEqual([second.id]);
		expect(second.depends_on).toEqual([third.id]);
		expect(third.depends_on).toEqual([]);
		expect(first.depends_on.every((dependency) => dependency.startsWith("s_"))).toBe(true);
	});

	it("returns deterministic fallback intermediate when provider emits invalid JSON", async () => {
		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([[{ type: "token", content: "{not-json" }, { type: "done" }]]),
		);

		const classified = await classifySegmentsFromStreamingAdapter({
			segments: ["First", "Second"],
			model: SEGMENT_MODEL,
		});

		expect(classified).toEqual({
			sections: [
				{
					text: "First",
					goal_type: "context",
					canonical_order: 1,
					confidence: 0.1,
					depends_on: [],
				},
				{
					text: "Second",
					goal_type: "context",
					canonical_order: 1,
					confidence: 0.1,
					depends_on: [],
				},
			],
		});
	});

	it("returns deterministic fallback intermediate when provider emits an error event", async () => {
		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([
				[
					{
						type: "error",
						provider: "groq",
						code: "PROVIDER_UNAVAILABLE",
						message: "upstream unavailable",
						retryable: true,
						status: 503,
					},
				],
			]),
		);

		const classified = await classifySegmentsFromStreamingAdapter({
			segments: ["Only segment"],
			model: SEGMENT_MODEL,
		});

		expect(classified).toEqual({
			sections: [
				{
					text: "Only segment",
					goal_type: "context",
					canonical_order: 1,
					confidence: 0.1,
					depends_on: [],
				},
			],
		});
	});

	it("returns deterministic fallback intermediate when provider throws before yielding tokens", async () => {
		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createThrowingAdapter(new Error("503 service unavailable")),
		);

		const classified = await classifySegmentsFromStreamingAdapter({
			segments: ["Only segment"],
			model: SEGMENT_MODEL,
		});

		expect(classified).toEqual({
			sections: [
				{
					text: "Only segment",
					goal_type: "context",
					canonical_order: 1,
					confidence: 0.1,
					depends_on: [],
				},
			],
		});
	});

	it("parses aggregated streaming tokens into intermediate JSON before normalization", async () => {
		const intermediatePayload: SegmentClassificationIntermediate = {
			sections: [
				{
					text: "first",
					goal_type: "context",
					depends_on: [],
				},
			],
		};

		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([[...toStreamingJsonEvents(intermediatePayload, 7)]]),
		);

		const classified = await classifySegmentsFromStreamingAdapter({
			segments: ["first"],
			model: SEGMENT_MODEL,
		});

		expect(classified).toEqual(intermediatePayload);
	});
});