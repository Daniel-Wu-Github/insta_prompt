export type RetryPolicy = {
	maxAttempts: number;
	initialDelayMs: number;
	backoffMultiplier: number;
	maxDelayMs: number;
};

export const PROVIDER_RETRY_POLICY: RetryPolicy = {
	maxAttempts: 3,
	initialDelayMs: 100,
	backoffMultiplier: 2,
	maxDelayMs: 5000,
};

export type SleepFn = (ms: number) => Promise<void>;

export const defaultSleep: SleepFn = async (ms) => {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
};

export type RetryWithBackoffOptions<T> = {
	operation: (attempt: number) => Promise<T>;
	shouldRetry: (error: unknown) => boolean;
	policy?: RetryPolicy;
	sleepFn?: SleepFn;
	onRetry?: (params: { attempt: number; delayMs: number; error: unknown }) => void | Promise<void>;
};

export function computeBackoffDelayMs(attempt: number, policy: RetryPolicy = PROVIDER_RETRY_POLICY): number {
	const exponent = Math.max(0, attempt - 1);
	const rawDelay = policy.initialDelayMs * policy.backoffMultiplier ** exponent;
	return Math.min(rawDelay, policy.maxDelayMs);
}

export async function retryWithBackoff<T>(options: RetryWithBackoffOptions<T>): Promise<T> {
	const policy = options.policy ?? PROVIDER_RETRY_POLICY;
	const sleepFn = options.sleepFn ?? defaultSleep;

	let attempt = 1;
	for (;;) {
		try {
			return await options.operation(attempt);
		} catch (error) {
			const hasRemainingAttempts = attempt < policy.maxAttempts;
			if (!hasRemainingAttempts || !options.shouldRetry(error)) {
				throw error;
			}

			const delayMs = computeBackoffDelayMs(attempt, policy);
			if (options.onRetry) {
				await options.onRetry({ attempt, delayMs, error });
			}

			await sleepFn(delayMs);
			attempt += 1;
		}
	}
}