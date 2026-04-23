import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";

import { bindRouteHandler } from "../services/routeHandlers";

type BindStreamEvent =
	| { type: "token"; data: string }
	| { type: "done" }
	| { type: "error"; message: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const groqEnvVarName = ["GROQ", "API", "KEY"].join("_");
const supabaseUrlVarName = "SUPABASE_URL";
const supabaseServiceKeyVarName = ["SUPABASE", "SERVICE", "KEY"].join("_");

const BASE_BIND_SECTIONS = [
	{
		canonical_order: 4,
		goal_type: "action",
		expansion: "Implement a keyboard-accessible dark mode toggle.",
	},
	{
		canonical_order: 2,
		goal_type: "tech_stack",
		expansion: "Use React 18 with TypeScript.",
	},
] as const;

const VALID_BIND_BODY = {
	mode: "balanced",
	sections: BASE_BIND_SECTIONS,
} as const;

let originalFetch: typeof globalThis.fetch;
let originalGroqEnvValue: string | undefined;
let originalSupabaseUrlValue: string | undefined;
let originalSupabaseServiceKeyValue: string | undefined;

function createBindApp(): Hono {
	const app = new Hono();

	app.use("*", async (c, next) => {
		c.set("tier", "free");
		c.set("userId", "test-user-id");
		await next();
	});

	app.post("/bind", bindRouteHandler);
	return app;
}

async function postBind(app: Hono, body: unknown, signal?: AbortSignal): Promise<Response> {
	return await app.fetch(
		new Request("http://localhost/bind", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal,
		}),
	);
}

function createGroqSseResponse(blocks: string[]): Response {
	return new Response(`${blocks.join("\n\n")}\n\n`, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream",
		},
	});
}

function parseSseEvents(streamPayload: string): BindStreamEvent[] {
	const blocks = streamPayload.split("\n\n");
	const events: BindStreamEvent[] = [];

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
			events.push(JSON.parse(rawPayload) as BindStreamEvent);
		} catch {
			// Ignore trailing partial frames during abort scenarios.
		}
	}

	return events;
}

function parseInsertRowFromRequestBody(rawBody: unknown): Record<string, unknown> {
	if (typeof rawBody !== "string") {
		return {};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return {};
	}

	if (Array.isArray(parsed)) {
		const first = parsed[0];
		return first && typeof first === "object" ? (first as Record<string, unknown>) : {};
	}

	return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

describe("/bind route", () => {
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		originalGroqEnvValue = process.env[groqEnvVarName];
		originalSupabaseUrlValue = process.env[supabaseUrlVarName];
		originalSupabaseServiceKeyValue = process.env[supabaseServiceKeyVarName];

		process.env[groqEnvVarName] = "placeholder";
		process.env[supabaseUrlVarName] = "http://supabase.local";
		process.env[supabaseServiceKeyVarName] = "service-role-placeholder";
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;

		if (originalGroqEnvValue === undefined) {
			delete process.env[groqEnvVarName];
		} else {
			process.env[groqEnvVarName] = originalGroqEnvValue;
		}

		if (originalSupabaseUrlValue === undefined) {
			delete process.env[supabaseUrlVarName];
		} else {
			process.env[supabaseUrlVarName] = originalSupabaseUrlValue;
		}

		if (originalSupabaseServiceKeyValue === undefined) {
			delete process.env[supabaseServiceKeyVarName];
		} else {
			process.env[supabaseServiceKeyVarName] = originalSupabaseServiceKeyValue;
		}
	});

	it("returns standard 400 JSON validation errors for invalid payloads", async () => {
		const app = createBindApp();

		const response = await postBind(app, {
			mode: "balanced",
			sections: [],
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

	it("assembles bind prompt with canonical goal_type ordering even when sections are out of order", async () => {
		const app = createBindApp();
		let capturedProviderBody: Record<string, unknown> | null = null;

		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const url = String(input);

			if (url.includes("api.groq.com/openai/v1/chat/completions")) {
				capturedProviderBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
				return createGroqSseResponse([
					'data: {"choices":[{"delta":{"content":"Canonical "}}]}',
					"data: [DONE]",
				]);
			}

			if (url.includes("/rest/v1/enhancement_history")) {
				return new Response("[]", {
					status: 201,
					headers: {
						"Content-Type": "application/json",
					},
				});
			}

			throw new Error(`Unexpected fetch call: ${url}`);
		}) as typeof globalThis.fetch;

		const outOfOrderSections = [
			{ canonical_order: 6, goal_type: "edge_case", expansion: "Handle empty states." },
			{ canonical_order: 4, goal_type: "action", expansion: "Build the toggle interactions." },
			{ canonical_order: 1, goal_type: "context", expansion: "This is an internal dashboard." },
			{ canonical_order: 2, goal_type: "tech_stack", expansion: "Use React and TypeScript." },
		] as const;

		const response = await postBind(app, {
			mode: "balanced",
			sections: outOfOrderSections,
		});

		expect(response.status).toBe(200);
		const events = parseSseEvents(await response.text());
		expect(events.filter((event) => event.type === "done")).toHaveLength(1);

		expect(capturedProviderBody).not.toBeNull();
		const messages = (capturedProviderBody?.messages ?? []) as Array<{ role: string; content: string }>;
		expect(messages.length).toBe(1);

		const prompt = messages[0]?.content ?? "";
		const contextIndex = prompt.indexOf("[slot 1 | context]");
		const techStackIndex = prompt.indexOf("[slot 2 | tech_stack]");
		const actionIndex = prompt.indexOf("[slot 4 | action]");
		const edgeCaseIndex = prompt.indexOf("[slot 6 | edge_case]");

		expect(contextIndex).toBeGreaterThan(-1);
		expect(techStackIndex).toBeGreaterThan(contextIndex);
		expect(actionIndex).toBeGreaterThan(techStackIndex);
		expect(edgeCaseIndex).toBeGreaterThan(actionIndex);
	});

	it("streams ordered token events, persists history exactly once, and emits one done", async () => {
		const app = createBindApp();
		const insertBodies: unknown[] = [];

		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const url = String(input);

			if (url.includes("api.groq.com/openai/v1/chat/completions")) {
				return createGroqSseResponse([
					'data: {"choices":[{"delta":{"content":"Hello "}}]}',
					'data: {"choices":[{"delta":{"content":"world"}}]}',
					"data: [DONE]",
				]);
			}

			if (url.includes("/rest/v1/enhancement_history")) {
				insertBodies.push(init?.body ?? null);
				return new Response("[]", {
					status: 201,
					headers: {
						"Content-Type": "application/json",
					},
				});
			}

			throw new Error(`Unexpected fetch call: ${url}`);
		}) as typeof globalThis.fetch;

		const requestBody = {
			mode: "balanced",
			sections: [
				{
					canonical_order: 4,
					goal_type: "action",
					expansion: "Implement interactions.",
				},
				{
					canonical_order: 2,
					goal_type: "tech_stack",
					expansion: "Use React and TypeScript.",
				},
			],
		} as const;

		const response = await postBind(app, requestBody);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")?.includes("text/event-stream")).toBe(true);

		const events = parseSseEvents(await response.text());
		const tokenPayloads = events
			.filter((event): event is Extract<BindStreamEvent, { type: "token" }> => event.type === "token")
			.map((event) => event.data);
		const doneEvents = events.filter((event) => event.type === "done");

		expect(tokenPayloads).toEqual(["Hello ", "world"]);
		expect(doneEvents).toHaveLength(1);
		expect(events[events.length - 1]).toEqual({ type: "done" });

		expect(insertBodies).toHaveLength(1);
		const insertRow = parseInsertRowFromRequestBody(insertBodies[0]);
		expect(insertRow.user_id).toBe("test-user-id");
		expect(insertRow.project_id).toBeNull();
		expect(insertRow.raw_input).toBe(JSON.stringify(requestBody.sections));
		expect(insertRow.final_prompt).toBe("Hello world");
		expect(insertRow.mode).toBe("balanced");
		expect(insertRow.model_used).toBe("groq:llama-3.3-70b-versatile");
		expect(insertRow.section_count).toBe(2);
	});

	it("emits one error event and no done when persistence fails after provider completion", async () => {
		const app = createBindApp();
		let insertCallCount = 0;

		globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
			const url = String(input);

			if (url.includes("api.groq.com/openai/v1/chat/completions")) {
				return createGroqSseResponse([
					'data: {"choices":[{"delta":{"content":"Final "}}]}',
					'data: {"choices":[{"delta":{"content":"prompt"}}]}',
					"data: [DONE]",
				]);
			}

			if (url.includes("/rest/v1/enhancement_history")) {
				insertCallCount += 1;
				return new Response(
					JSON.stringify({
						message: "db write failed",
					}),
					{
						status: 500,
						headers: {
							"Content-Type": "application/json",
						},
					},
				);
			}

			throw new Error(`Unexpected fetch call: ${url}`);
		}) as typeof globalThis.fetch;

		const response = await postBind(app, VALID_BIND_BODY);
		expect(response.status).toBe(200);

		const events = parseSseEvents(await response.text());
		const doneEvents = events.filter((event) => event.type === "done");
		const errorEvents = events.filter((event): event is Extract<BindStreamEvent, { type: "error" }> => event.type === "error");

		expect(insertCallCount).toBe(1);
		expect(doneEvents).toHaveLength(0);
		expect(errorEvents).toHaveLength(1);
		expect(errorEvents[0]?.message).toBe("Bind history persistence failed.");
	});

	it("stops streaming and avoids persistence writes when request is aborted early", async () => {
		const app = createBindApp();
		const abortController = new AbortController();
		let providerRequestSignalSeen = false;
		let historyInsertCallCount = 0;

		globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const url = String(_input);

			if (url.includes("api.groq.com/openai/v1/chat/completions")) {
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

							controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"tick"}}]}\n\n'));
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
			}

			if (url.includes("/rest/v1/enhancement_history")) {
				historyInsertCallCount += 1;
				return new Response("[]", {
					status: 201,
					headers: {
						"Content-Type": "application/json",
					},
				});
			}

			throw new Error(`Unexpected fetch call: ${url}`);
		}) as typeof globalThis.fetch;

		const response = await postBind(app, VALID_BIND_BODY, abortController.signal);
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
		try {
			for (let index = 0; index < 10; index += 1) {
				const next = await readWithTimeout();
				if (next.done) {
					streamTerminated = true;
					break;
				}

				if (next.value) {
					collected += decoder.decode(next.value);
				}
			}
		} catch (error) {
			readError = error;
		}

		if (readError) {
			const isAbortLikeError =
				(readError instanceof DOMException && readError.name === "AbortError") ||
				(readError instanceof Error && (readError.name === "AbortError" || readError.message === "read-timeout"));

			expect(isAbortLikeError).toBe(true);
		} else {
			expect(streamTerminated).toBe(true);
		}

		expect(providerRequestSignalSeen).toBe(true);
		expect(historyInsertCallCount).toBe(0);

		const events = parseSseEvents(collected);
		const tokenEvents = events.filter((event) => event.type === "token");
		const doneEvents = events.filter((event) => event.type === "done");
		const errorEvents = events.filter((event) => event.type === "error");

		expect(tokenEvents.length).toBeGreaterThanOrEqual(1);
		expect(doneEvents).toHaveLength(0);
		expect(errorEvents).toHaveLength(0);
	});
});
