import type { ProviderErrorCode, ProviderName, ProviderStreamErrorEvent } from "./types";

type ProviderAdapterErrorInit = {
	provider: ProviderName;
	code: ProviderErrorCode;
	message: string;
	retryable: boolean;
	status?: number;
	cause?: unknown;
};

export class ProviderAdapterError extends Error {
	readonly provider: ProviderName;
	readonly code: ProviderErrorCode;
	readonly retryable: boolean;
	readonly status?: number;

	constructor(init: ProviderAdapterErrorInit) {
		super(init.message);
		this.name = "ProviderAdapterError";
		this.provider = init.provider;
		this.code = init.code;
		this.retryable = init.retryable;
		this.status = init.status;

		if (init.cause !== undefined) {
			(this as { cause?: unknown }).cause = init.cause;
		}
	}
}

const CONNECTION_RESET_PATTERNS = [/econnreset/i, /connection reset/i, /socket hang up/i];

function baseErrorMessage(provider: ProviderName, message: string): string {
	const label = provider === "groq" ? "Groq" : "Anthropic";
	return `${label}: ${message}`;
}

export function createProviderKeyMissingError(provider: ProviderName): ProviderAdapterError {
	return new ProviderAdapterError({
		provider,
		code: "PROVIDER_KEY_MISSING",
		message: baseErrorMessage(provider, "API key is missing."),
		retryable: false,
	});
}

export function createProviderTimeoutError(provider: ProviderName, timeoutMs: number): ProviderAdapterError {
	return new ProviderAdapterError({
		provider,
		code: "PROVIDER_TIMEOUT",
		message: baseErrorMessage(provider, `request timed out after ${timeoutMs}ms.`),
		retryable: true,
	});
}

export function createProviderAbortedError(provider: ProviderName): ProviderAdapterError {
	return new ProviderAdapterError({
		provider,
		code: "PROVIDER_ABORTED",
		message: baseErrorMessage(provider, "request was aborted."),
		retryable: false,
	});
}

export function createProviderInvalidResponseError(provider: ProviderName, detail?: string): ProviderAdapterError {
	const suffix = detail ? ` (${detail})` : "";
	return new ProviderAdapterError({
		provider,
		code: "PROVIDER_INVALID_RESPONSE",
		message: baseErrorMessage(provider, `returned an invalid streaming payload${suffix}.`),
		retryable: false,
	});
}

export function createProviderConnectionResetError(provider: ProviderName, cause?: unknown): ProviderAdapterError {
	return new ProviderAdapterError({
		provider,
		code: "PROVIDER_CONNECTION_RESET",
		message: baseErrorMessage(provider, "connection reset during request."),
		retryable: true,
		cause,
	});
}

export function mapProviderHttpError(provider: ProviderName, status: number, detailMessage?: string): ProviderAdapterError {
	const normalizedDetail = detailMessage?.trim();
	const withOptionalDetail = (message: string): string => {
		if (!normalizedDetail) {
			return baseErrorMessage(provider, message);
		}

		return baseErrorMessage(provider, `${message} (${normalizedDetail.slice(0, 180)})`);
	};

	switch (status) {
		case 429:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_RATE_LIMITED",
				message: withOptionalDetail("rate limit exceeded"),
				retryable: true,
				status,
			});
		case 502:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_BAD_GATEWAY",
				message: withOptionalDetail("upstream gateway error"),
				retryable: true,
				status,
			});
		case 503:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_UNAVAILABLE",
				message: withOptionalDetail("service unavailable"),
				retryable: true,
				status,
			});
		case 504:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_GATEWAY_TIMEOUT",
				message: withOptionalDetail("gateway timeout"),
				retryable: true,
				status,
			});
		case 400:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_BAD_REQUEST",
				message: withOptionalDetail("bad request"),
				retryable: false,
				status,
			});
		case 401:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_UNAUTHORIZED",
				message: withOptionalDetail("unauthorized"),
				retryable: false,
				status,
			});
		case 403:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_FORBIDDEN",
				message: withOptionalDetail("forbidden"),
				retryable: false,
				status,
			});
		case 404:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_NOT_FOUND",
				message: withOptionalDetail("resource not found"),
				retryable: false,
				status,
			});
		case 500:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_INTERNAL_ERROR",
				message: withOptionalDetail("internal server error"),
				retryable: false,
				status,
			});
		default:
			return new ProviderAdapterError({
				provider,
				code: "PROVIDER_UNKNOWN_ERROR",
				message: withOptionalDetail("request failed"),
				retryable: false,
				status,
			});
	}
}

export function normalizeProviderThrowable(provider: ProviderName, error: unknown): ProviderAdapterError {
	if (error instanceof ProviderAdapterError) {
		return error;
	}

	if (error instanceof DOMException && error.name === "AbortError") {
		return createProviderAbortedError(provider);
	}

	const message = error instanceof Error ? error.message : String(error);
	if (CONNECTION_RESET_PATTERNS.some((pattern) => pattern.test(message))) {
		return createProviderConnectionResetError(provider, error);
	}

	return new ProviderAdapterError({
		provider,
		code: "PROVIDER_NETWORK_ERROR",
		message: baseErrorMessage(provider, "network failure during provider request."),
		retryable: false,
		cause: error,
	});
}

export function isRetryableProviderError(error: unknown): boolean {
	return error instanceof ProviderAdapterError && error.retryable;
}

export function toProviderErrorEvent(provider: ProviderName, error: unknown): ProviderStreamErrorEvent {
	const normalized = normalizeProviderThrowable(provider, error);
	return {
		type: "error",
		provider: normalized.provider,
		code: normalized.code,
		message: normalized.message,
		retryable: normalized.retryable,
		status: normalized.status,
	};
}