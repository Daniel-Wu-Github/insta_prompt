import { useEffect, useState } from "react";

import type { Tier } from "../../../../shared/contracts";

export type AccountUsage = {
	count: number;
	limit: number;
};

export type AccountStatusValue = {
	tier: Tier;
	usage: AccountUsage | null;
	dailyReset: number | null;
	isLoading: boolean;
	error: boolean;
};

type AccountStatusResponse = {
	tier?: unknown;
	enhanceCount?: unknown;
	dailyLimit?: unknown;
	dailyReset?: unknown;
};

type StoredAuth = {
	access_token: string;
	refresh_token: string | null;
	expires_at: number;
};

const FALLBACK_STATE: AccountStatusValue = {
	tier: "free",
	usage: null,
	dailyReset: null,
	isLoading: false,
	error: true,
};

const isTier = (value: unknown): value is Tier => {
	return value === "free" || value === "pro" || value === "byok";
};

const normalizeExpiresAtSeconds = (expiresAt: number): number => {
	return expiresAt > 1_000_000_000_000 ? Math.floor(expiresAt / 1000) : expiresAt;
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

// auth is passed from App — the hook re-fetches whenever the access_token changes,
// which covers: initial load, sign-in, and token refresh updates from storage.
export function useAccountStatus(auth: StoredAuth | null): AccountStatusValue {
	const [state, setState] = useState<AccountStatusValue>({
		tier: "free",
		usage: null,
		dailyReset: null,
		isLoading: true,
		error: false,
	});

	useEffect(() => {
		if (!auth) {
			setState(FALLBACK_STATE);
			return;
		}

		let cancelled = false;
		setState({ tier: "free", usage: null, dailyReset: null, isLoading: true, error: false });

		(async () => {
			let tokenToUse = auth.access_token;

			const expiresAtSeconds = normalizeExpiresAtSeconds(auth.expires_at);
			if (Date.now() / 1000 >= expiresAtSeconds - 30) {
				const refreshed = await sendRuntimeMessage<{ accessToken?: string | null }>({ type: "REFRESH_TOKEN" });
				if (cancelled) return;
				if (refreshed?.accessToken) {
					tokenToUse = refreshed.accessToken;
				}
			}

			const accountStatus = await sendRuntimeMessage<AccountStatusResponse>({
				type: "ACCOUNT_STATUS_REQUEST",
				jwt: tokenToUse,
			});

			if (cancelled) return;

			if (!accountStatus) {
				setState(FALLBACK_STATE);
				return;
			}

			const tier: Tier = isTier(accountStatus.tier) ? accountStatus.tier : "free";
			const enhanceCount = typeof accountStatus.enhanceCount === "number" ? accountStatus.enhanceCount : null;
			const dailyLimit = typeof accountStatus.dailyLimit === "number" ? accountStatus.dailyLimit : null;
			const dailyReset = typeof accountStatus.dailyReset === "number" ? accountStatus.dailyReset : null;

			setState({
				tier,
				usage: enhanceCount !== null && dailyLimit !== null ? { count: enhanceCount, limit: dailyLimit } : null,
				dailyReset,
				isLoading: false,
				error: false,
			});
		})().catch(() => {
			if (!cancelled) setState(FALLBACK_STATE);
		});

		return () => {
			cancelled = true;
		};
	}, [auth?.access_token]); // Re-run whenever the token identity changes

	return state;
}
