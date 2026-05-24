import { useEffect, useState } from "react";

import type { Tier } from "../../../../shared/contracts";

const SETTINGS_STORAGE_KEY = "promptcompiler.settings";
const BACKEND_BASE_URL = "http://localhost:3000";

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

const FALLBACK_STATE: AccountStatusValue = {
	tier: "free",
	usage: null,
	isLoading: false,
	error: true,
};

const isTier = (value: unknown): value is Tier => {
	return value === "free" || value === "pro" || value === "byok";
};

const extractJwt = (value: unknown): string | undefined => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	for (const key of ["token", "accessToken", "access_token", "jwt"]) {
		const candidate = record[key];
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}

	for (const key of ["session", "auth", "data"]) {
		const nested = extractJwt(record[key]);
		if (nested) {
			return nested;
		}
	}

	return undefined;
};

const readStoredJwt = (): Promise<string | undefined> => {
	return new Promise((resolve) => {
		chrome.storage.local.get(null, (snapshot) => {
			const record = snapshot as Record<string, unknown>;
			const settings = record[SETTINGS_STORAGE_KEY];
			if (settings) {
				const fromSettings = extractJwt(settings);
				if (fromSettings) {
					resolve(fromSettings);
					return;
				}
			}

			for (const value of Object.values(record)) {
				const jwt = extractJwt(value);
				if (jwt) {
					resolve(jwt);
					return;
				}
			}

			resolve(undefined);
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
			const jwt = await readStoredJwt();
			if (cancelled) {
				return;
			}

			if (!jwt) {
				setState(FALLBACK_STATE);
				return;
			}

			try {
				const response = await fetch(`${BACKEND_BASE_URL}/account/status`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${jwt}`,
						Accept: "application/json",
					},
				});

				if (!response.ok) {
					if (!cancelled) {
						setState(FALLBACK_STATE);
					}
					return;
				}

				const payload = (await response.json()) as AccountStatusResponse;
				if (cancelled) {
					return;
				}

				const tier: Tier = isTier(payload.tier) ? payload.tier : "free";
				const enhanceCount = typeof payload.enhanceCount === "number" ? payload.enhanceCount : null;
				const dailyLimit = typeof payload.dailyLimit === "number" ? payload.dailyLimit : null;

				setState({
					tier,
					usage: enhanceCount !== null && dailyLimit !== null ? { count: enhanceCount, limit: dailyLimit } : null,
					isLoading: false,
					error: false,
				});
			} catch {
				if (!cancelled) {
					setState(FALLBACK_STATE);
				}
			}
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
