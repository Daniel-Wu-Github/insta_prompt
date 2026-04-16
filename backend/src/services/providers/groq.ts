import {
	createProviderInvalidResponseError,
	createProviderKeyMissingError,
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

const GROQ_STREAM_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_TEMPERATURE = 0;

type GroqStreamChunk = {
	choices?: Array<{
		delta?: {
			content?: string | null;
		};
		finish_reason?: string | null;
	}>;
};

export type GroqAdapterConfig = {
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

	const fromEnv = process.env.GROQ_API_KEY?.trim();
	return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

function parseGroqChunk(data: string): GroqStreamChunk {
	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch {
		throw createProviderInvalidResponseError("groq", "non-JSON stream chunk");
	}

	if (!parsed || typeof parsed !== "object") {
		throw createProviderInvalidResponseError("groq", "stream chunk is not an object");
	}

	return parsed as GroqStreamChunk;
}

async function* streamGroqResponse(response: Response): AsyncGenerator<ProviderStreamEvent> {
	let sentDone = false;

	for await (const event of parseSseEvents(response.body as ReadableStream<Uint8Array>)) {
		if (event.data === "[DONE]") {
			sentDone = true;
			yield { type: "done" };
			return;
		}

		const chunk = parseGroqChunk(event.data);
		const textDelta = chunk.choices?.[0]?.delta?.content;
		if (typeof textDelta === "string" && textDelta.length > 0) {
			yield {
				type: "token",
				content: textDelta,
			};
		}

		const finishReason = chunk.choices?.[0]?.finish_reason;
		if (typeof finishReason === "string" && finishReason.length > 0) {
			sentDone = true;
			yield { type: "done" };
			return;
		}
	}

	if (!sentDone) {
		yield { type: "done" };
	}
}

export function createGroqStreamingAdapter(config: GroqAdapterConfig = {}): ProviderStreamingAdapter {
	const fetchFn = config.fetchFn ?? defaultFetch;
	const sleepFn = config.sleepFn ?? defaultSleep;
	const retryPolicy = config.retryPolicy ?? PROVIDER_RETRY_POLICY;
	const endpoint = config.endpoint ?? GROQ_STREAM_ENDPOINT;

	return {
		provider: "groq",
		stream: async function* (request: ProviderStreamRequest): AsyncGenerator<ProviderStreamEvent> {
			const authKey = resolveApiKey(request);
			if (!authKey) {
				yield toProviderErrorEvent("groq", createProviderKeyMissingError("groq"));
				return;
			}

			const messages: Array<{ role: "system" | "user"; content: string }> = [];
			if (request.systemPrompt && request.systemPrompt.trim().length > 0) {
				messages.push({
					role: "system",
					content: request.systemPrompt,
				});
			}

			messages.push({
				role: "user",
				content: request.userPrompt,
			});

			try {
				const response = await fetchProviderStreamResponse({
					provider: "groq",
					url: endpoint,
					headers: {
						Authorization: `Bearer ${authKey}`,
						"Content-Type": "application/json",
					},
					body: {
						model: request.model,
						messages,
						stream: true,
						temperature: request.temperature ?? DEFAULT_GROQ_TEMPERATURE,
						max_completion_tokens: request.maxTokens,
					},
					fetchFn,
					sleepFn,
					retryPolicy,
					requestTimeoutMs: config.requestTimeoutMs,
					signal: request.signal,
				});

				yield* streamGroqResponse(response);
			} catch (error) {
				yield toProviderErrorEvent("groq", error);
			}
		},
	};
}