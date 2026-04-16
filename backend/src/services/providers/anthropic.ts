import {
	ProviderAdapterError,
	createProviderInvalidResponseError,
	createProviderKeyMissingError,
	mapProviderHttpError,
	toProviderErrorEvent,
} from "./errors";
import { fetchProviderStreamResponse } from "./http";
import { parseSseEvents } from "./sse";
import {
	PROVIDER_RETRY_POLICY,
	defaultSleep,
	type RetryPolicy,
	type SleepFn,
} from "./retry";
import type {
	FetchLike,
	ProviderStreamEvent,
	ProviderStreamRequest,
	ProviderStreamingAdapter,
} from "./types";

const ANTHROPIC_STREAM_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

type AnthropicStreamDelta = {
	type?: string;
	text?: string;
};

type AnthropicStreamEventPayload = {
	type?: string;
	delta?: AnthropicStreamDelta;
	error?: {
		type?: string;
		message?: string;
	};
};

export type AnthropicAdapterConfig = {
	fetchFn?: FetchLike;
	sleepFn?: SleepFn;
	retryPolicy?: RetryPolicy;
	endpoint?: string;
	requestTimeoutMs?: number;
};

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	return fetch(input, init);
}

function resolveApiKey(request: ProviderStreamRequest): string | null {
	const fromRequest = request.apiKey?.trim();
	if (fromRequest && fromRequest.length > 0) {
		return fromRequest;
	}

	const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
	return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

function parseAnthropicEventPayload(data: string): AnthropicStreamEventPayload {
	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch {
		throw createProviderInvalidResponseError("anthropic", "non-JSON stream chunk");
	}

	if (!parsed || typeof parsed !== "object") {
		throw createProviderInvalidResponseError("anthropic", "stream chunk is not an object");
	}

	return parsed as AnthropicStreamEventPayload;
}

function toAnthropicStreamError(payload: AnthropicStreamEventPayload): ProviderAdapterError {
	const errorType = payload.error?.type ?? "";
	const message = payload.error?.message;

	if (errorType === "overloaded_error") {
		return mapProviderHttpError("anthropic", 503, message);
	}

	if (errorType === "rate_limit_error") {
		return mapProviderHttpError("anthropic", 429, message);
	}

	return new ProviderAdapterError({
		provider: "anthropic",
		code: "PROVIDER_UNKNOWN_ERROR",
		message: `Anthropic: stream error (${errorType || "unknown_error"}).`,
		retryable: false,
	});
}

async function* streamAnthropicResponse(response: Response): AsyncGenerator<ProviderStreamEvent> {
	let sentDone = false;

	for await (const event of parseSseEvents(response.body as ReadableStream<Uint8Array>)) {
		const payload = parseAnthropicEventPayload(event.data);

		if (event.event === "error" || payload.type === "error") {
			throw toAnthropicStreamError(payload);
		}

		if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") {
			if (typeof payload.delta.text === "string" && payload.delta.text.length > 0) {
				yield {
					type: "token",
					content: payload.delta.text,
				};
			}
			continue;
		}

		if (payload.type === "message_stop") {
			sentDone = true;
			yield { type: "done" };
			return;
		}
	}

	if (!sentDone) {
		yield { type: "done" };
	}
}

export function createAnthropicStreamingAdapter(config: AnthropicAdapterConfig = {}): ProviderStreamingAdapter {
	const fetchFn = config.fetchFn ?? defaultFetch;
	const sleepFn = config.sleepFn ?? defaultSleep;
	const retryPolicy = config.retryPolicy ?? PROVIDER_RETRY_POLICY;
	const endpoint = config.endpoint ?? ANTHROPIC_STREAM_ENDPOINT;

	return {
		provider: "anthropic",
		stream: async function* (request: ProviderStreamRequest): AsyncGenerator<ProviderStreamEvent> {
			const authKey = resolveApiKey(request);
			if (!authKey) {
				yield toProviderErrorEvent("anthropic", createProviderKeyMissingError("anthropic"));
				return;
			}

			const body: Record<string, unknown> = {
				model: request.model,
				max_tokens: request.maxTokens,
				stream: true,
				messages: [
					{
						role: "user",
						content: request.userPrompt,
					},
				],
			};

			if (request.systemPrompt && request.systemPrompt.trim().length > 0) {
				body.system = request.systemPrompt;
			}

			if (typeof request.temperature === "number") {
				body.temperature = request.temperature;
			}

			try {
				const response = await fetchProviderStreamResponse({
					provider: "anthropic",
					url: endpoint,
					headers: {
						"Content-Type": "application/json",
						"x-api-key": authKey,
						"anthropic-version": ANTHROPIC_API_VERSION,
					},
					body,
					fetchFn,
					sleepFn,
					retryPolicy,
					requestTimeoutMs: config.requestTimeoutMs,
					signal: request.signal,
				});

				yield* streamAnthropicResponse(response);
			} catch (error) {
				yield toProviderErrorEvent("anthropic", error);
			}
		},
	};
}