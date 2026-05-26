import { useEffect, useRef, useState } from "react";

import { AccountStatus } from "./components/AccountStatus";
import { ModeToggle } from "./components/ModeToggle";
import { ProjectSelector } from "./components/ProjectSelector";
import { UpgradeCTA } from "./components/UpgradeCTA";
import { useAccountStatus } from "./hooks/useAccountStatus";
import { useSettings } from "./hooks/useSettings";

const AUTH_STORAGE_KEY = "promptcompiler.auth";

// Injected at build time via .env — must be set for login to work.
const SUPABASE_URL = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_SUPABASE_ANON_KEY;

type StoredAuth = {
	access_token: string;
	refresh_token: string | null;
	expires_at: number;
};

function isStoredAuth(value: unknown): value is StoredAuth {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record.access_token === "string" && record.access_token.trim().length > 0 && typeof record.expires_at === "number";
}

type SupabaseAuthResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_at?: number;
	expires_in?: number;
	error_description?: string;
	msg?: string;
};

export default function App() {
	const { settings, isLoading: settingsLoading, setMode, setProjectId } = useSettings();
	const account = useAccountStatus();

	// undefined = still loading from storage; null = not authenticated
	const [auth, setAuth] = useState<StoredAuth | null | undefined>(undefined);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [authError, setAuthError] = useState<string | null>(null);
	const [authLoading, setAuthLoading] = useState(false);
	const [sessionNotice, setSessionNotice] = useState<string | null>(null);
	const suppressAuthRemovalNoticeRef = useRef(false);

	useEffect(() => {
		chrome.storage.local.get(AUTH_STORAGE_KEY, (result) => {
			const stored = (result as Record<string, unknown>)[AUTH_STORAGE_KEY];
			setAuth(isStoredAuth(stored) ? stored : null);
		});
	}, []);

	useEffect(() => {
		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string,
		): void => {
			if (areaName !== "local" && areaName !== "session") {
				return;
			}

			const authChange = changes[AUTH_STORAGE_KEY];
			if (!authChange) {
				return;
			}

			if (isStoredAuth(authChange.newValue)) {
				setAuth(authChange.newValue);
				setSessionNotice(null);
				setAuthError(null);
				return;
			}

			if (suppressAuthRemovalNoticeRef.current) {
				suppressAuthRemovalNoticeRef.current = false;
				setAuth(null);
				return;
			}

			setAuth(null);
			if (auth !== null) {
				setSessionNotice("Session expired. Please sign in again.");
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, [auth]);

	const handleLogin = async (): Promise<void> => {
		if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
			setAuthError("Auth not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
			return;
		}
		if (!email.trim() || !password.trim()) {
			setAuthError("Email and password are required.");
			return;
		}

		setAuthLoading(true);
		setAuthError(null);

		try {
			const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
				method: "POST",
				headers: {
					"apikey": SUPABASE_ANON_KEY,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email: email.trim(), password }),
			});

			const data = (await response.json()) as SupabaseAuthResponse;

			if (!response.ok) {
				const message =
					(data.error_description?.trim() ?? "") ||
					(data.msg?.trim() ?? "") ||
					`Sign-in failed (${response.status})`;
				setAuthError(message);
				return;
			}

			const access_token = data.access_token?.trim();
			if (!access_token) {
				setAuthError("Sign-in response is missing access_token.");
				return;
			}

			const refresh_token = data.refresh_token?.trim() ?? null;
			// Supabase returns expires_at in Unix seconds; store as milliseconds.
			const expires_at =
				typeof data.expires_at === "number"
					? data.expires_at * 1000
					: Date.now() + (typeof data.expires_in === "number" ? data.expires_in * 1000 : 3_600_000);

			const stored: StoredAuth = { access_token, refresh_token, expires_at };
			await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: stored });
			setAuth(stored);
			setSessionNotice(null);
		} catch (error) {
			setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
		} finally {
			setAuthLoading(false);
		}
	};

	const handleLogout = async (): Promise<void> => {
		suppressAuthRemovalNoticeRef.current = true;
		await chrome.storage.local.remove(AUTH_STORAGE_KEY);
		setAuth(null);
		setSessionNotice(null);
		setAuthError(null);
	};

	if (auth === undefined || settingsLoading) {
		return <main style={{ padding: 12 }}>Loading…</main>;
	}

	if (auth === null) {
		return (
			<main style={{ width: 320, padding: 12, fontFamily: "system-ui, sans-serif" }}>
				<h1 style={{ margin: "0 0 12px 0", fontSize: 16 }}>PromptCompiler</h1>
				<p style={{ margin: "0 0 8px 0", fontSize: 13, color: "#555" }}>Sign in to continue.</p>
				{sessionNotice !== null && (
					<p style={{ margin: "0 0 8px 0", fontSize: 12, color: "#b45309" }}>{sessionNotice}</p>
				)}
				<input
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => { setEmail(e.target.value); }}
					style={{ display: "block", width: "100%", marginBottom: 8, padding: "6px 8px", fontSize: 13, boxSizing: "border-box" }}
				/>
				<input
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => { setPassword(e.target.value); }}
					onKeyDown={(e) => { if (e.key === "Enter" && !authLoading) void handleLogin(); }}
					style={{ display: "block", width: "100%", marginBottom: 8, padding: "6px 8px", fontSize: 13, boxSizing: "border-box" }}
				/>
				{authError !== null && (
					<p style={{ margin: "0 0 8px 0", fontSize: 12, color: "#c00" }}>{authError}</p>
				)}
				<button
					onClick={() => { void handleLogin(); }}
					disabled={authLoading}
					style={{ padding: "6px 16px", fontSize: 13, cursor: authLoading ? "default" : "pointer" }}
				>
					{authLoading ? "Signing in…" : "Sign in"}
				</button>
			</main>
		);
	}

	const showUpgradeCTA =
		account.tier === "free" &&
		!account.isLoading &&
		!account.error &&
		account.usage !== null &&
		account.usage.count >= account.usage.limit;

	return (
		<main style={{ width: 320, padding: 12, fontFamily: "system-ui, sans-serif" }}>
			<h1 style={{ margin: "0 0 12px 0", fontSize: 16 }}>PromptCompiler</h1>

			<ModeToggle mode={settings.mode} onChange={setMode} />
			<ProjectSelector projectId={settings.projectId} onChange={setProjectId} />
			<AccountStatus
				tier={account.tier}
				usage={account.usage}
				isLoading={account.isLoading}
				error={account.error}
			/>
			{account.error && (
				<p style={{ margin: "0 0 8px 0", fontSize: 12, color: "#b45309" }}>
					Account status is unavailable. If the session expired, sign in again.
				</p>
			)}
			<UpgradeCTA visible={showUpgradeCTA} />

			<button
				onClick={() => { void handleLogout(); }}
				style={{ marginTop: 12, padding: "4px 12px", fontSize: 12, cursor: "pointer", color: "#555" }}
			>
				Sign out
			</button>
		</main>
	);
}
