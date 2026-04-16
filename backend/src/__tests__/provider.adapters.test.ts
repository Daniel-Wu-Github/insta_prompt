import { describe, expect, it } from "bun:test";

import {
	ProviderAdapterError,
	createAnthropicStreamingAdapter,
	createGroqStreamingAdapter,
	createProviderTimeoutError,
	isRetryableProviderError,
	mapProviderHttpError,
	retryWithBackoff,
	type FetchLike,
	type ProviderErrorCode,
	type ProviderStreamEvent,
} from "../services/providers";

function createSseResponse(blocks: string[], status = 200): Response {
	return new Response(`${blocks.join("\n\n")}\n\n`, {
		status,
		headers: {
			"Content-Type": "text/event-stream",
		},
	});
}

function createJsonErrorResponse(status: number, message: string): Response {
	return new Response(
		JSON.stringify({
			error: {
				message,
			},
		}),
		{
			status,
			headers: {
				"Content-Type": "application/json",
			},
		},
	);
}

async function collectEvents(stream: AsyncGenerator<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
	const events: ProviderStreamEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}

	return events;
}

const BASE_REQUEST = {
	model: "llama-3.3-70b-versatile",
	userPrompt: "hello",
	maxTokens: 64,
	apiKey: "test-key",
};

describe("provider adapters", () => {
	it("streams normalized Groq token/done object events", async () => {
		const fetchFn: FetchLike = async () => {
			return createSseResponse([
				'data: {"choices":[{"delta":{"content":"Hello"}}]}',
				'data: {"choices":[{"delta":{"content":" world"}}]}',
				"data: [DONE]",
			]);
		};

		const adapter = createGroqStreamingAdapter({ fetchFn });
		const events = await collectEvents(adapter.stream(BASE_REQUEST));

		expect(events).toEqual([
			{ type: "token", content: "Hello" },
			{ type: "token", content: " world" },
			{ type: "done" },
		]);
	});

	it("streams normalized Anthropic token/done object events", async () => {
		const fetchFn: FetchLike = async () => {
			return createSseResponse([
				'event: message_start\ndata: {"type":"message_start"}',
				'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
				'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}',
				'event: message_stop\ndata: {"type":"message_stop"}',
			]);
		};

		const adapter = createAnthropicStreamingAdapter({ fetchFn });
		const events = await collectEvents(adapter.stream({
			...BASE_REQUEST,
			model: "claude-sonnet-4-6",
		}));

		expect(events).toEqual([
			{ type: "token", content: "Hi" },
			{ type: "token", content: " there" },
			{ type: "done" },
		]);
	});

	it("retries only on allowed transient HTTP statuses", async () => {
		const retryableStatuses = [429, 502, 503, 504] as const;

		for (const status of retryableStatuses) {
			const delays: number[] = [];
			let attempts = 0;

			const fetchFn: FetchLike = async () => {
				attempts += 1;
				if (attempts === 1) {
					return createJsonErrorResponse(status, `transient-${status}`);
				}

				return createSseResponse([
					'data: {"choices":[{"delta":{"content":"ok"}}]}',
					"data: [DONE]",
				]);
			};

			const adapter = createGroqStreamingAdapter({
				fetchFn,
				sleepFn: async (ms) => {
					delays.push(ms);
				},
			});

			const events = await collectEvents(adapter.stream(BASE_REQUEST));

			expect(attempts).toBe(2);
			expect(delays).toEqual([100]);
			expect(events[events.length - 1]).toEqual({ type: "done" });
		}
	});

	it("does not retry on non-retryable HTTP statuses", async () => {
		const nonRetryableStatuses = [400, 401, 403, 404, 500] as const;
		const expectedCodes: Record<(typeof nonRetryableStatuses)[number], ProviderErrorCode> = {
			400: "PROVIDER_BAD_REQUEST",
			401: "PROVIDER_UNAUTHORIZED",
			403: "PROVIDER_FORBIDDEN",
			404: "PROVIDER_NOT_FOUND",
			500: "PROVIDER_INTERNAL_ERROR",
		};

		for (const status of nonRetryableStatuses) {
			const delays: number[] = [];
			let attempts = 0;

			const fetchFn: FetchLike = async () => {
				attempts += 1;
				return createJsonErrorResponse(status, `non-retryable-${status}`);
			};

			const adapter = createGroqStreamingAdapter({
				fetchFn,
				sleepFn: async (ms) => {
					delays.push(ms);
				},
			});

			const events = await collectEvents(adapter.stream(BASE_REQUEST));
			expect(attempts).toBe(1);
			expect(delays).toEqual([]);
			expect(events.length).toBe(1);

			const errorEvent = events[0];
			expect(errorEvent.type).toBe("error");
			if (errorEvent.type === "error") {
				expect(errorEvent.code).toBe(expectedCodes[status]);
				expect(errorEvent.retryable).toBe(false);
			}
		}
	});

	it("retries on provider timeout errors", async () => {
		let attempts = 0;
		const delays: number[] = [];

		const fetchFn: FetchLike = async () => {
			attempts += 1;
			if (attempts === 1) {
				throw createProviderTimeoutError("groq", 120);
			}

			return createSseResponse([
				'data: {"choices":[{"delta":{"content":"retry-timeout-ok"}}]}',
				"data: [DONE]",
			]);
		};

		const adapter = createGroqStreamingAdapter({
			fetchFn,
			sleepFn: async (ms) => {
				delays.push(ms);
			},
		});

		const events = await collectEvents(adapter.stream(BASE_REQUEST));
		expect(attempts).toBe(2);
		expect(delays).toEqual([100]);
		expect(events[events.length - 1]).toEqual({ type: "done" });
	});

	it("retries on connection reset errors", async () => {
		let attempts = 0;
		const delays: number[] = [];

		const fetchFn: FetchLike = async () => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("ECONNRESET socket hang up");
			}

			return createSseResponse([
				'data: {"choices":[{"delta":{"content":"retry-conn-reset-ok"}}]}',
				"data: [DONE]",
			]);
		};

		const adapter = createGroqStreamingAdapter({
			fetchFn,
			sleepFn: async (ms) => {
				delays.push(ms);
			},
		});

		const events = await collectEvents(adapter.stream(BASE_REQUEST));
		expect(attempts).toBe(2);
		expect(delays).toEqual([100]);
		expect(events[events.length - 1]).toEqual({ type: "done" });
	});

	it("caps retry attempts at the configured maximum", async () => {
		let attempts = 0;
		const delays: number[] = [];

		let caught: unknown;
		try {
			await retryWithBackoff({
				operation: async () => {
					attempts += 1;
					throw mapProviderHttpError("groq", 503, "always unavailable");
				},
				shouldRetry: (error) => isRetryableProviderError(error),
				sleepFn: async (ms) => {
					delays.push(ms);
				},
			});
		} catch (error) {
			caught = error;
		}

		expect(attempts).toBe(3);
		expect(delays).toEqual([100, 200]);
		expect(caught).toBeInstanceOf(ProviderAdapterError);
	});
});