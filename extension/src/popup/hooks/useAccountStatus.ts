import { useEffect, useState } from "react";

import type { Tier } from "../../../../shared/contracts";

const AUTH_STORAGE_KEY = "promptcompiler.auth";

export type AccountUsage = {
	count: number;
	limit: number;
};

export type AccountStatusValue = {
	tier: Tier;
	usage: AccountUsage | null;
	isLoading: boolean;
	error: boolean;
};

type AccountStatusResponse = {
	tier?: unknown;
	enhanceCount?: unknown;
	dailyLimit?: unknown;
};

type StoredAuth = {
	access_token: string;
	refresh_token: string | null;
	expires_at: number;
};

const FALLBACK_STATE: AccountStatusValue = {
	tier: "free",
	usage: null,
	isLoading: false,
	error: true,
};

const isTier = (value: unknown): value is Tier => {
	return value === "free" || value === "pro" || value === "byok";
};

const normalizeExpiresAtSeconds = (expiresAt: number): number => {
	return expiresAt > 1_000_000_000_000 ? Math.floor(expiresAt / 1000) : expiresAt;
};

const extractStoredAuth = (value: unknown): StoredAuth | undefined => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const accessToken = typeof record.access_token === "string" ? record.access_token.trim() : "";
	const refreshToken = typeof record.refresh_token === "string" ? record.refresh_token.trim() : "";
	const expiresAt = typeof record.expires_at === "number" ? record.expires_at : undefined;

	if (!accessToken || expiresAt === undefined) {
		return undefined;
	}

	return {
		access_token: accessToken,
		refresh_token: refreshToken.length > 0 ? refreshToken : null,
		expires_at: expiresAt,
	};
};

const readStoredAuth = async (): Promise<StoredAuth | undefined> => {
	const [localSnapshot, sessionSnapshot] = await Promise.all([
		chrome.storage.local.get(null),
		chrome.storage.session.get(null),
	]);

	for (const snapshot of [localSnapshot, sessionSnapshot]) {
		for (const [key, value] of Object.entries(snapshot)) {
			if (key === AUTH_STORAGE_KEY) {
				const storedAuth = extractStoredAuth(value);
				if (storedAuth) {
					return storedAuth;
				}
			}
		}
	}

	for (const snapshot of [localSnapshot, sessionSnapshot]) {
		for (const value of Object.values(snapshot)) {
			const storedAuth = extractStoredAuth(value);
			if (storedAuth) {
				return storedAuth;
			}
		}
	}

	return undefined;
};

const sendRuntimeMessage = <T,>(message: Record<string, unknown>): Promise<T | null> => {
	return new Promise((resolve, reject) => {
		chrome.runtime.sendMessage(message, (response) => {
			const runtimeError = chrome.runtime.lastError;
			if (runtimeError) {
				reject(new Error(runtimeError.message));
				return;
			}

			resolve((response as T | undefined) ?? null);
		});
	});
};

export function useAccountStatus(): AccountStatusValue {
	const [state, setState] = useState<AccountStatusValue>({
		tier: "free",
		usage: null,
		isLoading: true,
		error: false,
	});

	useEffect(() => {
		let cancelled = false;

		(async () => {
			const auth = await readStoredAuth();
			if (cancelled) {
				return;
			}

			if (!auth) {
				setState(FALLBACK_STATE);
				return;
			}

			const expiresAtSeconds = normalizeExpiresAtSeconds(auth.expires_at);
			if (Date.now() / 1000 >= expiresAtSeconds - 30) {
				const refreshed = await sendRuntimeMessage<{ accessToken?: string | null }>({ type: "REFRESH_TOKEN" });
				if (cancelled) {
					return;
				}

				if (!refreshed?.accessToken) {
					setState(FALLBACK_STATE);
					return;
				}

				const refreshedAuth = await readStoredAuth();
				if (cancelled) {
					return;
				}

				if (!refreshedAuth) {
					setState(FALLBACK_STATE);
					return;
				}

				const accountStatus = await sendRuntimeMessage<AccountStatusResponse>({ type: "ACCOUNT_STATUS_REQUEST", jwt: refreshedAuth.access_token });
				if (cancelled) {
					return;
				}

				if (!accountStatus) {
					setState(FALLBACK_STATE);
					return;
				}

				const tier: Tier = isTier(accountStatus.tier) ? accountStatus.tier : "free";
				const enhanceCount = typeof accountStatus.enhanceCount === "number" ? accountStatus.enhanceCount : null;
				const dailyLimit = typeof accountStatus.dailyLimit === "number" ? accountStatus.dailyLimit : null;

				setState({
					tier,
					usage: enhanceCount !== null && dailyLimit !== null ? { count: enhanceCount, limit: dailyLimit } : null,
					isLoading: false,
					error: false,
				});
				return;
			}

			const accountStatus = await sendRuntimeMessage<AccountStatusResponse>({ type: "ACCOUNT_STATUS_REQUEST", jwt: auth.access_token });
			if (cancelled) {
				return;
			}

			if (!accountStatus) {
				setState(FALLBACK_STATE);
				return;
			}

			const tier: Tier = isTier(accountStatus.tier) ? accountStatus.tier : "free";
			const enhanceCount = typeof accountStatus.enhanceCount === "number" ? accountStatus.enhanceCount : null;
			const dailyLimit = typeof accountStatus.dailyLimit === "number" ? accountStatus.dailyLimit : null;

			setState({
				tier,
				usage: enhanceCount !== null && dailyLimit !== null ? { count: enhanceCount, limit: dailyLimit } : null,
				isLoading: false,
				error: false,
			});
		})().catch(() => {
			if (!cancelled) {
				setState(FALLBACK_STATE);
			}
		});

		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
