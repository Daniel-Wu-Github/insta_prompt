import type { RetryPolicy, SleepFn } from "./retry";

export type ProviderName = "groq" | "anthropic";

export type ProviderErrorCode =
	| "PROVIDER_TIMEOUT"
	| "PROVIDER_CONNECTION_RESET"
	| "PROVIDER_RATE_LIMITED"
	| "PROVIDER_BAD_GATEWAY"
	| "PROVIDER_UNAVAILABLE"
	| "PROVIDER_GATEWAY_TIMEOUT"
	| "PROVIDER_BAD_REQUEST"
	| "PROVIDER_UNAUTHORIZED"
	| "PROVIDER_FORBIDDEN"
	| "PROVIDER_NOT_FOUND"
	| "PROVIDER_INTERNAL_ERROR"
	| "PROVIDER_KEY_MISSING"
	| "PROVIDER_ABORTED"
	| "PROVIDER_INVALID_RESPONSE"
	| "PROVIDER_NETWORK_ERROR"
	| "PROVIDER_UNKNOWN_ERROR";

export type ProviderStreamTokenEvent = {
	type: "token";
	content: string;
};

export type ProviderStreamDoneEvent = {
	type: "done";
};

export type ProviderStreamErrorEvent = {
	type: "error";
	provider: ProviderName;
	code: ProviderErrorCode;
	message: string;
	retryable: boolean;
	status?: number;
};

export type ProviderStreamEvent =
	| ProviderStreamTokenEvent
	| ProviderStreamDoneEvent
	| ProviderStreamErrorEvent;

export type ProviderStreamRequest = {
	model: string;
	userPrompt: string;
	systemPrompt?: string | null;
	maxTokens: number;
	temperature?: number;
	apiKey?: string | null;
	signal?: AbortSignal;
};

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ProviderAdapterDependencies = {
	fetchFn: FetchLike;
	sleepFn: SleepFn;
	retryPolicy: RetryPolicy;
	requestTimeoutMs: number;
};

export type ProviderStreamingAdapter = {
	provider: ProviderName;
	stream: (request: ProviderStreamRequest) => AsyncGenerator<ProviderStreamEvent>;
};