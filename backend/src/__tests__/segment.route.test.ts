import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";

import {
	__resetSegmentProviderAdapterOverridesForTests,
	__setSegmentProviderAdapterOverrideForTests,
} from "../services/segment";
import type { ProviderStreamEvent, ProviderStreamingAdapter } from "../services/providers";
import { segmentRouteHandler } from "../services/routeHandlers";

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

function toStreamingJsonEvents(payload: unknown, chunkSize = 48): ProviderStreamEvent[] {
	const text = JSON.stringify(payload);
	if (text.length === 0) {
		return [{ type: "done" }];
	}

	const events: ProviderStreamEvent[] = [];
	for (let index = 0; index < text.length; index += chunkSize) {
		events.push({ type: "token", content: text.slice(index, index + chunkSize) });
	}

	events.push({ type: "done" });
	return events;
}

function createSegmentApp(): Hono {
	const app = new Hono();
	app.post("/segment", segmentRouteHandler);
	return app;
}

async function postSegment(app: Hono, body: unknown): Promise<Response> {
	return app.request("/segment", {
		method: "POST",
		headers: new Headers({
			"Content-Type": "application/json",
		}),
		body: JSON.stringify(body),
	});
}

describe("/segment route", () => {
	afterEach(() => {
		__resetSegmentProviderAdapterOverridesForTests();
	});

	it("returns 400 for malformed JSON body", async () => {
		const app = createSegmentApp();

		const response = await app.request("/segment", {
			method: "POST",
			headers: new Headers({ "Content-Type": "application/json" }),
			body: "{",
		});

		expect(response.status).toBe(400);
		const payload = (await response.json()) as {
			error: {
				code: string;
				message: string;
			};
		};

		expect(payload.error.code).toBe("VALIDATION_ERROR");
		expect(payload.error.message).toBe("Invalid JSON body");
	});

	it("returns 400 when segments normalize to an empty list", async () => {
		const app = createSegmentApp();

		const response = await postSegment(app, {
			segments: ["   ", "\n\t"],
			mode: "balanced",
		});

		expect(response.status).toBe(400);
		const payload = (await response.json()) as {
			error: {
				code: string;
				message: string;
			};
		};

		expect(payload.error.code).toBe("VALIDATION_ERROR");
		expect(payload.error.message).toBe("segments must include at least one non-empty string");
	});

	it("returns 400 for an invalid mode with a deterministic validation envelope", async () => {
		const app = createSegmentApp();

		const response = await postSegment(app, {
			segments: ["build feature"],
			mode: "experimental",
		});

		expect(response.status).toBe(400);
		const payload = (await response.json()) as {
			error: {
				code: string;
				details: Array<{
					path: string;
					message: string;
				}>;
			};
		};

		expect(payload.error.code).toBe("VALIDATION_ERROR");
		expect(payload.error.details.map((detail) => detail.path)).toContain("mode");
	});

	it("returns normalized schema-valid output for a minimal valid segment set", async () => {
		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([
				toStreamingJsonEvents({
					sections: [
						{
							text: "  install framework  ",
							goal_type: "Framework",
							confidence: 2,
							depends_on: [0],
						},
					],
				}),
			]),
		);

		const app = createSegmentApp();
		const response = await postSegment(app, {
			segments: ["install framework"],
			mode: "balanced",
		});

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			sections: Array<{
				id: string;
				text: string;
				goal_type: string;
				canonical_order: number;
				confidence: number;
				depends_on: string[];
			}>;
		};

		expect(payload.sections).toHaveLength(1);
		expect(payload.sections[0]).toEqual({
			id: deriveExpectedStableId("install framework", 0),
			text: "install framework",
			goal_type: "tech_stack",
			canonical_order: 2,
			confidence: 1,
			depends_on: [],
		});
	});

	it("keeps deterministic ids/dependencies for ambiguous duplicate segments across repeated calls", async () => {
		const intermediatePayload = {
			sections: [
				{
					text: "Fix bug",
					goal_type: "Context",
					confidence: 0.6,
					depends_on: [0, 1],
				},
				{
					text: "Fix bug",
					goal_type: "Action",
					confidence: 0.5,
					depends_on: [2],
				},
				{
					text: "Add tests",
					goal_type: "Constraint",
					confidence: 0.4,
					depends_on: [1],
				},
			],
		};

		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([toStreamingJsonEvents(intermediatePayload)]),
		);

		const app = createSegmentApp();
		const requestBody = {
			segments: ["Fix bug", "Fix bug", "Add tests"],
			mode: "balanced",
		};

		const firstResponse = await postSegment(app, requestBody);
		const secondResponse = await postSegment(app, requestBody);

		expect(firstResponse.status).toBe(200);
		expect(secondResponse.status).toBe(200);

		const firstPayload = (await firstResponse.json()) as {
			sections: Array<{
				id: string;
				goal_type: string;
				canonical_order: number;
				depends_on: string[];
			}>;
		};
		const secondPayload = (await secondResponse.json()) as {
			sections: Array<{
				id: string;
				goal_type: string;
				canonical_order: number;
				depends_on: string[];
			}>;
		};

		expect(firstPayload).toEqual(secondPayload);

		const expectedIds = [
			deriveExpectedStableId("Fix bug", 0),
			deriveExpectedStableId("Fix bug", 1),
			deriveExpectedStableId("Add tests", 0),
		];

		expect(firstPayload.sections.map((section) => section.id)).toEqual(expectedIds);
		expect(firstPayload.sections.map((section) => section.goal_type)).toEqual([
			"context",
			"action",
			"constraint",
		]);
		expect(firstPayload.sections.map((section) => section.canonical_order)).toEqual([1, 4, 3]);
		expect(firstPayload.sections[0]?.depends_on).toEqual([expectedIds[1] as string]);
		expect(firstPayload.sections[1]?.depends_on).toEqual([expectedIds[2] as string]);
		expect(firstPayload.sections[2]?.depends_on).toEqual([]);
	});

	it("returns deterministic fallback 200 when provider stream returns invalid JSON", async () => {
		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([[{ type: "token", content: "{not-json" }, { type: "done" }]]),
		);

		const app = createSegmentApp();
		const response = await postSegment(app, {
			segments: ["First clause", "Second clause"],
			mode: "balanced",
		});

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			sections: Array<{
				id: string;
				text: string;
				goal_type: string;
				canonical_order: number;
				confidence: number;
				depends_on: string[];
			}>;
		};

		expect(payload.sections).toEqual([
			{
				id: deriveExpectedStableId("First clause", 0),
				text: "First clause",
				goal_type: "context",
				canonical_order: 1,
				confidence: 0.1,
				depends_on: [],
			},
			{
				id: deriveExpectedStableId("Second clause", 0),
				text: "Second clause",
				goal_type: "context",
				canonical_order: 1,
				confidence: 0.1,
				depends_on: [],
			},
		]);
	});

	it("returns deterministic fallback 200 when provider throws before streaming tokens", async () => {
		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createThrowingAdapter(new Error("503 service unavailable")),
		);

		const app = createSegmentApp();
		const response = await postSegment(app, {
			segments: ["provider failure"],
			mode: "balanced",
		});

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			sections: Array<{
				id: string;
				text: string;
				goal_type: string;
				canonical_order: number;
				confidence: number;
				depends_on: string[];
			}>;
		};

		expect(payload.sections).toEqual([
			{
				id: deriveExpectedStableId("provider failure", 0),
				text: "provider failure",
				goal_type: "context",
				canonical_order: 1,
				confidence: 0.1,
				depends_on: [],
			},
		]);
	});

	it("returns deterministic fallback 200 when provider emits a 503 error event", async () => {
		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([
				[
					{
						type: "error",
						provider: "groq",
						code: "PROVIDER_UNAVAILABLE",
						message: "service unavailable",
						retryable: true,
						status: 503,
					},
				],
			]),
		);

		const app = createSegmentApp();
		const response = await postSegment(app, {
			segments: ["provider failed"],
			mode: "balanced",
		});

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			sections: Array<{
				id: string;
				text: string;
				goal_type: string;
				canonical_order: number;
				confidence: number;
				depends_on: string[];
			}>;
		};

		expect(payload.sections).toEqual([
			{
				id: deriveExpectedStableId("provider failed", 0),
				text: "provider failed",
				goal_type: "context",
				canonical_order: 1,
				confidence: 0.1,
				depends_on: [],
			},
		]);
	});

	it("keeps warm-path processing median under 50ms and responses deterministic", async () => {
		const intermediatePayload = {
			sections: [
				{
					text: "Warm path section",
					goal_type: "action",
					confidence: 0.7,
					depends_on: [],
				},
			],
		};

		__setSegmentProviderAdapterOverrideForTests(
			"groq",
			createStreamingAdapter([toStreamingJsonEvents(intermediatePayload)]),
		);

		const app = createSegmentApp();
		const requestBody = {
			segments: ["Warm path section"],
			mode: "balanced",
		};

		const warmupResponse = await postSegment(app, requestBody);
		expect(warmupResponse.status).toBe(200);

		const samplesMs: number[] = [];
		const payloads: Array<{
			sections: Array<{
				id: string;
				text: string;
				goal_type: string;
				canonical_order: number;
				confidence: number;
				depends_on: string[];
			}>;
		}> = [];

		for (let index = 0; index < 7; index += 1) {
			const start = performance.now();
			const response = await postSegment(app, requestBody);
			const elapsedMs = performance.now() - start;

			expect(response.status).toBe(200);
			samplesMs.push(elapsedMs);
			payloads.push(
				(await response.json()) as {
					sections: Array<{
						id: string;
						text: string;
						goal_type: string;
						canonical_order: number;
						confidence: number;
						depends_on: string[];
					}>;
				},
			);
		}

		const baseline = payloads[0];
		if (!baseline) {
			throw new Error("Expected warm-path payload samples");
		}

		for (const payload of payloads) {
			expect(payload).toEqual(baseline);
		}

		const sortedSamples = [...samplesMs].sort((left, right) => left - right);
		const medianSample = sortedSamples[Math.floor(sortedSamples.length / 2)] ?? Number.POSITIVE_INFINITY;
		expect(medianSample).toBeLessThan(50);
	});
});