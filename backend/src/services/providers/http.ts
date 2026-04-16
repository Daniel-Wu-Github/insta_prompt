import {
	createProviderAbortedError,
	createProviderInvalidResponseError,
	createProviderTimeoutError,
	isRetryableProviderError,
	mapProviderHttpError,
	normalizeProviderThrowable,
} from "./errors";
import { PROVIDER_RETRY_POLICY, retryWithBackoff, type RetryPolicy, type SleepFn } from "./retry";
import type { FetchLike, ProviderName } from "./types";

export const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 30_000;

type FetchProviderStreamResponseInput = {
	provider: ProviderName;
	url: string;
	headers: Record<string, string>;
	body: unknown;
	fetchFn: FetchLike;
	retryPolicy?: RetryPolicy;
	sleepFn?: SleepFn;
	requestTimeoutMs?: number;
	signal?: AbortSignal;
};

function extractErrorMessage(payload: unknown): string | undefined {
	if (!payload || typeof payload !== "object") {
		return undefined;
	}

	const directMessage = (payload as { message?: unknown }).message;
	if (typeof directMessage === "string" && directMessage.trim().length > 0) {
		return directMessage.trim();
	}

	const nestedError = (payload as { error?: unknown }).error;
	if (nestedError && typeof nestedError === "object") {
		const nestedMessage = (nestedError as { message?: unknown }).message;
		if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
			return nestedMessage.trim();
		}
	}

	return undefined;
}

async function readResponseErrorMessage(response: Response): Promise<string | undefined> {
	let rawBody = "";
	try {
		rawBody = await response.text();
	} catch {
		return undefined;
	}

	const trimmed = rawBody.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(trimmed) as unknown;
		return extractErrorMessage(parsed) ?? trimmed.slice(0, 180);
	} catch {
		return trimmed.slice(0, 180);
	}
}

async function fetchProviderStreamResponseOnce(input: FetchProviderStreamResponseInput): Promise<Response> {
	const timeoutMs = input.requestTimeoutMs ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS;
	const requestController = new AbortController();
	let timedOut = false;
	let externallyAborted = false;

	const onExternalAbort = () => {
		externallyAborted = true;
		requestController.abort();
	};

	if (input.signal) {
		if (input.signal.aborted) {
			onExternalAbort();
		} else {
			input.signal.addEventListener("abort", onExternalAbort, { once: true });
		}
	}

	const timeoutId = setTimeout(() => {
		timedOut = true;
		requestController.abort();
	}, timeoutMs);

	try {
		const response = await input.fetchFn(input.url, {
			method: "POST",
			headers: input.headers,
			body: JSON.stringify(input.body),
			signal: requestController.signal,
		});

		if (!response.ok) {
			const detail = await readResponseErrorMessage(response);
			throw mapProviderHttpError(input.provider, response.status, detail);
		}

		if (!response.body) {
			throw createProviderInvalidResponseError(input.provider, "response body is empty");
		}

		return response;
	} catch (error) {
		if (timedOut) {
			throw createProviderTimeoutError(input.provider, timeoutMs);
		}

		if (externallyAborted) {
			throw createProviderAbortedError(input.provider);
		}

		throw normalizeProviderThrowable(input.provider, error);
	} finally {
		clearTimeout(timeoutId);
		if (input.signal) {
			input.signal.removeEventListener("abort", onExternalAbort);
		}
	}
}

export async function fetchProviderStreamResponse(input: FetchProviderStreamResponseInput): Promise<Response> {
	return await retryWithBackoff({
		operation: async () => await fetchProviderStreamResponseOnce(input),
		shouldRetry: (error) => isRetryableProviderError(error),
		policy: input.retryPolicy ?? PROVIDER_RETRY_POLICY,
		sleepFn: input.sleepFn,
	});
}