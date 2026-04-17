import { describe, expect, it } from "bun:test";

import {
	createAnthropicStreamingAdapter,
	createGroqStreamingAdapter,
	createProviderTimeoutError,
	type FetchLike,
	type ProviderErrorCode,
	type ProviderName,
	type ProviderStreamEvent,
	type ProviderStreamingAdapter,
} from "../services/providers";

type ProviderCase = {
	provider: ProviderName;
	request: {
		model: string;
		userPrompt: string;
		maxTokens: number;
		apiKey: string;
	};
	createAdapter: (params: {
		fetchFn: FetchLike;
		sleepFn?: (ms: number) => Promise<void>;
	}) => ProviderStreamingAdapter;
	successResponse: () => Response;
};

const RETRYABLE_HTTP_STATUSES = [429, 502, 503, 504] as const;
const NON_RETRYABLE_HTTP_STATUSES = [400, 401, 403, 404, 500] as const;

const NON_RETRYABLE_CODE_BY_STATUS: Record<(typeof NON_RETRYABLE_HTTP_STATUSES)[number], ProviderErrorCode> = {
	400: "PROVIDER_BAD_REQUEST",
	401: "PROVIDER_UNAUTHORIZED",
	403: "PROVIDER_FORBIDDEN",
	404: "PROVIDER_NOT_FOUND",
	500: "PROVIDER_INTERNAL_ERROR",
};

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

const PROVIDERS: readonly ProviderCase[] = [
	{
		provider: "groq",
		request: {
			model: "llama-3.3-70b-versatile",
			userPrompt: "hello",
			maxTokens: 64,
			apiKey: "test-key",
		},
		createAdapter: ({ fetchFn, sleepFn }) =>
			createGroqStreamingAdapter({
				fetchFn,
				sleepFn,
			}),
		successResponse: () => {
			return createSseResponse([
				'data: {"choices":[{"delta":{"content":"Hello"}}]}',
				'data: {"choices":[{"delta":{"content":" world"}}]}',
				"data: [DONE]",
			]);
		},
	},
	{
		provider: "anthropic",
		request: {
			model: "claude-sonnet-4-6",
			userPrompt: "hello",
			maxTokens: 64,
			apiKey: "test-key",
		},
		createAdapter: ({ fetchFn, sleepFn }) =>
			createAnthropicStreamingAdapter({
				fetchFn,
				sleepFn,
			}),
		successResponse: () => {
			return createSseResponse([
				'event: message_start\ndata: {"type":"message_start"}',
				'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
				'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}',
				'event: message_stop\ndata: {"type":"message_stop"}',
			]);
		},
	},
];

describe("provider adapters", () => {
	for (const providerCase of PROVIDERS) {
		it(`streams normalized ${providerCase.provider} token/done object events`, async () => {
			const fetchFn: FetchLike = async () => {
				return providerCase.successResponse();
			};

			const adapter = providerCase.createAdapter({ fetchFn });
			const events = await collectEvents(adapter.stream(providerCase.request));

			expect(events[events.length - 1]).toEqual({ type: "done" });
			expect(events.some((event) => event.type === "token")).toBe(true);
		});

		it(`${providerCase.provider} retries HTTP 429/502/503/504 with bounded backoff`, async () => {
			for (const status of RETRYABLE_HTTP_STATUSES) {
				const delays: number[] = [];
				let attempts = 0;

				const fetchFn: FetchLike = async () => {
					attempts += 1;
					if (attempts === 1) {
						return createJsonErrorResponse(status, `${providerCase.provider}-retryable-${status}`);
					}

					return providerCase.successResponse();
				};

				const adapter = providerCase.createAdapter({
					fetchFn,
					sleepFn: async (ms) => {
						delays.push(ms);
					},
				});

				const events = await collectEvents(adapter.stream(providerCase.request));

				expect(attempts).toBe(2);
				expect(delays).toEqual([100]);
				expect(events.some((event) => event.type === "error")).toBe(false);
				expect(events[events.length - 1]).toEqual({ type: "done" });
			}
		});

		it(`${providerCase.provider} retries timeout failures`, async () => {
			let attempts = 0;
			const delays: number[] = [];

			const fetchFn: FetchLike = async () => {
				attempts += 1;
				if (attempts === 1) {
					throw createProviderTimeoutError(providerCase.provider, 120);
				}

				return providerCase.successResponse();
			};

			const adapter = providerCase.createAdapter({
				fetchFn,
				sleepFn: async (ms) => {
					delays.push(ms);
				},
			});

			const events = await collectEvents(adapter.stream(providerCase.request));
			expect(attempts).toBe(2);
			expect(delays).toEqual([100]);
			expect(events[events.length - 1]).toEqual({ type: "done" });
		});

		it(`${providerCase.provider} retries connection reset failures`, async () => {
			let attempts = 0;
			const delays: number[] = [];

			const fetchFn: FetchLike = async () => {
				attempts += 1;
				if (attempts === 1) {
					throw new Error("ECONNRESET socket hang up");
				}

				return providerCase.successResponse();
			};

			const adapter = providerCase.createAdapter({
				fetchFn,
				sleepFn: async (ms) => {
					delays.push(ms);
				},
			});

			const events = await collectEvents(adapter.stream(providerCase.request));
			expect(attempts).toBe(2);
			expect(delays).toEqual([100]);
			expect(events[events.length - 1]).toEqual({ type: "done" });
		});

		it(`${providerCase.provider} does not retry HTTP 400/401/403/404/500 and maps normalized codes`, async () => {
			for (const status of NON_RETRYABLE_HTTP_STATUSES) {
				const delays: number[] = [];
				let attempts = 0;

				const fetchFn: FetchLike = async () => {
					attempts += 1;
					return createJsonErrorResponse(status, `${providerCase.provider}-non-retryable-${status}`);
				};

				const adapter = providerCase.createAdapter({
					fetchFn,
					sleepFn: async (ms) => {
						delays.push(ms);
					},
				});

				const events = await collectEvents(adapter.stream(providerCase.request));

				expect(attempts).toBe(1);
				expect(delays).toEqual([]);
				expect(events.length).toBe(1);

				const errorEvent = events[0];
				expect(errorEvent.type).toBe("error");
				if (errorEvent.type === "error") {
					expect(errorEvent.code).toBe(NON_RETRYABLE_CODE_BY_STATUS[status]);
					expect(errorEvent.status).toBe(status);
					expect(errorEvent.retryable).toBe(false);
					expect(errorEvent.provider).toBe(providerCase.provider);
				}
			}
		});

		it(`${providerCase.provider} stops after max retry attempts with deterministic delays`, async () => {
			let attempts = 0;
			const delays: number[] = [];

			const fetchFn: FetchLike = async () => {
				attempts += 1;
				return createJsonErrorResponse(503, `${providerCase.provider}-always-unavailable`);
			};

			const adapter = providerCase.createAdapter({
				fetchFn,
				sleepFn: async (ms) => {
					delays.push(ms);
				},
			});

			const events = await collectEvents(adapter.stream(providerCase.request));

			expect(attempts).toBe(3);
			expect(delays).toEqual([100, 200]);
			expect(events.length).toBe(1);
			const errorEvent = events[0];
			expect(errorEvent.type).toBe("error");
			if (errorEvent.type === "error") {
				expect(errorEvent.code).toBe("PROVIDER_UNAVAILABLE");
				expect(errorEvent.status).toBe(503);
				expect(errorEvent.retryable).toBe(true);
				expect(errorEvent.provider).toBe(providerCase.provider);
			}
		});
	}
});