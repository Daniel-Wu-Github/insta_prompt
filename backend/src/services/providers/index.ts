import { createAnthropicStreamingAdapter } from "./anthropic";
import { createGroqStreamingAdapter } from "./groq";

export {
	createAnthropicStreamingAdapter,
	type AnthropicAdapterConfig,
} from "./anthropic";
export {
	createGroqStreamingAdapter,
	type GroqAdapterConfig,
} from "./groq";
export {
	DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
	fetchProviderStreamResponse,
} from "./http";
export {
	ProviderAdapterError,
	createProviderAbortedError,
	createProviderConnectionResetError,
	createProviderInvalidResponseError,
	createProviderKeyMissingError,
	createProviderTimeoutError,
	isRetryableProviderError,
	mapProviderHttpError,
	normalizeProviderThrowable,
	toProviderErrorEvent,
} from "./errors";
export { parseSseEvents, type ParsedSseEvent } from "./sse";
export {
	PROVIDER_RETRY_POLICY,
	computeBackoffDelayMs,
	defaultSleep,
	retryWithBackoff,
	type RetryPolicy,
	type SleepFn,
} from "./retry";
export type {
	FetchLike,
	ProviderAdapterDependencies,
	ProviderErrorCode,
	ProviderName,
	ProviderStreamDoneEvent,
	ProviderStreamErrorEvent,
	ProviderStreamEvent,
	ProviderStreamRequest,
	ProviderStreamTokenEvent,
	ProviderStreamingAdapter,
} from "./types";

export const groqStreamingAdapter = createGroqStreamingAdapter();
export const anthropicStreamingAdapter = createAnthropicStreamingAdapter();