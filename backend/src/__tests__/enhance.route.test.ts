import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";

import { enhanceRouteHandler } from "../services/routeHandlers";

type EnhanceStreamEvent =
	| { type: "token"; data: string }
	| { type: "done" }
	| { type: "error"; message: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const VALID_ENHANCE_BODY = {
	section: {
		id: "s1",
		text: "Build a dark mode toggle.",
		goal_type: "action",
	},
	siblings: [
		{
			id: "s2",
			text: "Use React and TypeScript.",
			goal_type: "tech_stack",
		},
	],
	mode: "balanced",
	project_id: null,
} as const;

let originalFetch: typeof globalThis.fetch;
let originalGroqEnvValue: string | undefined;
const groqEnvVarName = "GROQ_API_KEY";

function createEnhanceApp(): Hono {
	const app = new Hono();

	app.use("*", async (c, next) => {
		c.set("tier", "free");
		c.set("userId", "test-user-id");
		await next();
	});

	app.post("/enhance", enhanceRouteHandler);
	return app;
}

function createGroqSseResponse(blocks: string[]): Response {
	return new Response(`${blocks.join("\n\n")}\n\n`, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream",
		},
	});
}

async function postEnhance(app: Hono, body: unknown, signal?: AbortSignal): Promise<Response> {
	return await app.fetch(
		new Request("http://localhost/enhance", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal,
		}),
	);
}

function parseSseEvents(streamPayload: string): EnhanceStreamEvent[] {
	const blocks = streamPayload.split("\n\n");
	const events: EnhanceStreamEvent[] = [];

	for (const block of blocks) {
		const trimmed = block.trim();
		if (trimmed.length === 0) {
			continue;
		}

		const dataLine = trimmed
			.split("\n")
			.find((line) => line.startsWith("data:"));

		if (!dataLine) {
			continue;
		}

		const rawPayload = dataLine.slice("data:".length).trim();
		try {
			events.push(JSON.parse(rawPayload) as EnhanceStreamEvent);
		} catch {
			// Ignore trailing partial frames in abort scenarios.
		}
	}

	return events;
}

describe("/enhance route", () => {
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		originalGroqEnvValue = process.env[groqEnvVarName];
		process.env[groqEnvVarName] = "placeholder";
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;

		if (originalGroqEnvValue === undefined) {
			delete process.env[groqEnvVarName];
		} else {
			process.env[groqEnvVarName] = originalGroqEnvValue;
		}
	});

	it("returns a standard 400 JSON validation envelope for invalid payloads", async () => {
		const app = createEnhanceApp();

		const response = await postEnhance(app, {
			section: {
				id: "s1",
			},
			mode: "balanced",
			siblings: [],
			project_id: null,
		});

		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")?.includes("application/json")).toBe(true);

		const payload = (await response.json()) as {
			error: {
				code: string;
				message: string;
				details: Array<{ path: string; message: string }>;
			};
		};

		expect(payload.error.code).toBe("VALIDATION_ERROR");
		expect(payload.error.message).toBe("Invalid request payload");
		expect(payload.error.details.length).toBeGreaterThan(0);
	});

	it("streams token events in order, ends with exactly one done event, and passes mode/goal_type into handoff prompt", async () => {
		const app = createEnhanceApp();
		let capturedProviderBody: Record<string, unknown> | null = null;

		globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			capturedProviderBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

			return createGroqSseResponse([
				'data: {"choices":[{"delta":{"content":"Hello "}}]}',
				'data: {"choices":[{"delta":{"content":"world"}}]}',
				"data: [DONE]",
			]);
		}) as typeof globalThis.fetch;

		const response = await postEnhance(app, VALID_ENHANCE_BODY);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")?.includes("text/event-stream")).toBe(true);

		const events = parseSseEvents(await response.text());
		const tokenPayloads = events
			.filter((event): event is Extract<EnhanceStreamEvent, { type: "token" }> => event.type === "token")
			.map((event) => event.data);
		const doneEvents = events.filter((event) => event.type === "done");

		expect(tokenPayloads).toEqual(["Hello ", "world"]);
		expect(doneEvents).toHaveLength(1);
		expect(events[events.length - 1]).toEqual({ type: "done" });

		expect(capturedProviderBody).not.toBeNull();
		const messages = (capturedProviderBody?.messages ?? []) as Array<{
			role: string;
			content: string;
		}>;
		expect(messages.length).toBe(1);
		expect(messages[0]?.role).toBe("user");
		expect(messages[0]?.content).toContain("Goal type: action");
		expect(messages[0]?.content).toContain("Use a structured response with 2-3 short sections.");
		expect(capturedProviderBody?.max_completion_tokens).toBe(500);
	});

	it("emits exactly one mapped error event and keeps HTTP status unchanged when upstream fails mid-stream", async () => {
		const app = createEnhanceApp();

		globalThis.fetch = (async (): Promise<Response> => {
			return createGroqSseResponse([
				'data: {"choices":[{"delta":{"content":"partial "}}]}',
				"data: {not-json}",
			]);
		}) as typeof globalThis.fetch;

		const response = await postEnhance(app, VALID_ENHANCE_BODY);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")?.includes("text/event-stream")).toBe(true);

		const events = parseSseEvents(await response.text());
		const tokenEvents = events.filter((event) => event.type === "token");
		const doneEvents = events.filter((event) => event.type === "done");
		const errorEvents = events.filter((event): event is Extract<EnhanceStreamEvent, { type: "error" }> => event.type === "error");

		expect(tokenEvents).toHaveLength(1);
		expect(errorEvents).toHaveLength(1);
		expect(doneEvents).toHaveLength(0);
		expect(errorEvents[0]?.message).toBe("Groq: invalid streaming response.");
	});

	it("handles AbortController cancellation without unhandled failures and stops stream progression", async () => {
		const app = createEnhanceApp();
		const abortController = new AbortController();
		let providerRequestSignalSeen = false;
		let providerChunkCount = 0;

		globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const signal = init?.signal;
			if (!signal) {
				throw new Error("Expected provider request signal");
			}

			providerRequestSignalSeen = true;

			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					let closed = false;

					const closeStream = () => {
						if (closed) {
							return;
						}

						closed = true;
						clearInterval(timer);
						controller.close();
					};

					const emitTokenChunk = () => {
						if (closed) {
							return;
						}

						providerChunkCount += 1;
						controller.enqueue(
							encoder.encode('data: {"choices":[{"delta":{"content":"tick"}}]}\n\n'),
						);

						if (providerChunkCount >= 200) {
							closeStream();
						}
					};

					emitTokenChunk();
					const timer = setInterval(() => {
						if (signal.aborted) {
							closeStream();
							return;
						}
						emitTokenChunk();
					}, 2);

					signal.addEventListener(
						"abort",
						() => {
							closeStream();
						},
						{ once: true },
					);
				},
			});

			return new Response(stream, {
				status: 200,
				headers: {
					"Content-Type": "text/event-stream",
				},
			});
		}) as typeof globalThis.fetch;

		const response = await postEnhance(app, VALID_ENHANCE_BODY, abortController.signal);
		expect(response.status).toBe(200);

		const reader = response.body?.getReader();
		expect(reader).toBeDefined();

		let collected = "";
		const firstChunk = await reader!.read();
		expect(firstChunk.done).toBe(false);
		if (firstChunk.value) {
			collected += decoder.decode(firstChunk.value);
		}

		abortController.abort();

		const readWithTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
			return await Promise.race([
				reader!.read(),
				new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) =>
					setTimeout(() => reject(new Error("read-timeout")), 300),
				),
			]);
		};

		let readError: unknown = null;
		let streamTerminated = false;
		let chunksAfterAbort = 0;
		try {
			for (let index = 0; index < 10; index += 1) {
				const next = await readWithTimeout();
				if (next.done) {
					streamTerminated = true;
					break;
				}

				if (next.value) {
					chunksAfterAbort += 1;
					collected += decoder.decode(next.value);
				}
			}
		} catch (error) {
			readError = error;
		}

		if (readError) {
			const isAbortError =
				(readError instanceof DOMException && readError.name === "AbortError") ||
				(readError instanceof Error && (readError.name === "AbortError" || readError.message === "read-timeout"));

			expect(isAbortError).toBe(true);
		} else {
			expect(streamTerminated).toBe(true);
		}

		expect(providerRequestSignalSeen).toBe(true);
		expect(chunksAfterAbort).toBeLessThanOrEqual(1);

		const events = parseSseEvents(collected);
		const tokenEvents = events.filter((event) => event.type === "token");
		const doneEvents = events.filter((event) => event.type === "done");
		const errorEvents = events.filter((event) => event.type === "error");

		expect(tokenEvents.length).toBeGreaterThanOrEqual(1);
		expect(doneEvents).toHaveLength(0);
		expect(errorEvents).toHaveLength(0);
	});
});