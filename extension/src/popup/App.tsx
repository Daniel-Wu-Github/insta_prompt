import { useEffect, useRef, useState } from "react";

import { AccountStatus } from "./components/AccountStatus";
import { ClauseOrderingToggle } from "./components/ClauseOrderingToggle";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ModeToggle } from "./components/ModeToggle";
import { PauseToggle } from "./components/PauseToggle";
import { ProjectSelector } from "./components/ProjectSelector";
import { UpgradeCTA } from "./components/UpgradeCTA";
import { useAccountStatus } from "./hooks/useAccountStatus";
import { useClauseOrdering } from "./hooks/useClauseOrdering";
import { usePause } from "./hooks/usePause";
import { useSettings } from "./hooks/useSettings";

const AUTH_STORAGE_KEY = "promptcompiler.auth";

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

function decodeJwtEmail(token: string): string | null {
	try {
		const part = token.split(".")[1];
		if (!part) return null;
		const padded = part.replace(/-/g, "+").replace(/_/g, "/");
		const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
		const email = payload.email;
		return typeof email === "string" && email.trim().length > 0 ? email.trim() : null;
	} catch {
		return null;
	}
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
	const { paused, toggle: togglePause } = usePause();
	const { ordering: clauseOrdering, set: setClauseOrdering } = useClauseOrdering();

	// undefined = still loading from storage; null = not authenticated
	const [auth, setAuth] = useState<StoredAuth | null | undefined>(undefined);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [authError, setAuthError] = useState<string | null>(null);
	const [authLoading, setAuthLoading] = useState(false);
	const [sessionNotice, setSessionNotice] = useState<string | null>(null);
	const [isSignUp, setIsSignUp] = useState(false);
	const suppressAuthRemovalNoticeRef = useRef(false);

	// Pass auth down so useAccountStatus re-fetches when the token changes (e.g. after sign-in).
	// auth ?? null collapses undefined (loading) and null (signed out) both to null.
	const account = useAccountStatus(auth ?? null);

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
			if (areaName !== "local" && areaName !== "session") return;
			const authChange = changes[AUTH_STORAGE_KEY];
			if (!authChange) return;

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
		return () => { chrome.storage.onChanged.removeListener(handleStorageChange); };
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
				headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), password }),
			});

			const data = (await response.json()) as SupabaseAuthResponse;

			if (!response.ok) {
				setAuthError(
					(data.error_description?.trim() ?? "") ||
					(data.msg?.trim() ?? "") ||
					`Sign-in failed (${response.status})`,
				);
				return;
			}

			const access_token = data.access_token?.trim();
			if (!access_token) { setAuthError("Sign-in response is missing access_token."); return; }

			const refresh_token = data.refresh_token?.trim() ?? null;
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

	const handleSignUp = async (): Promise<void> => {
		if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { setAuthError("Auth not configured."); return; }
		if (!email.trim() || !password.trim()) { setAuthError("Email and password are required."); return; }

		setAuthLoading(true);
		setAuthError(null);

		try {
			const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
				method: "POST",
				headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), password }),
			});

			const data = (await response.json()) as SupabaseAuthResponse;

			if (!response.ok) {
				setAuthError(
					(data.error_description?.trim() ?? "") ||
					(data.msg?.trim() ?? "") ||
					`Sign-up failed (${response.status})`,
				);
				return;
			}

			const access_token = data.access_token?.trim();
			if (!access_token) {
				setAuthError("Account created. Check your email to confirm, then sign in.");
				setIsSignUp(false);
				return;
			}

			const refresh_token = data.refresh_token?.trim() ?? null;
			const expires_at =
				typeof data.expires_at === "number"
					? data.expires_at * 1000
					: Date.now() + (typeof data.expires_in === "number" ? data.expires_in * 1000 : 3_600_000);

			const stored: StoredAuth = { access_token, refresh_token, expires_at };
			await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: stored });
			setAuth(stored);
			setSessionNotice(null);
		} catch (error) {
			setAuthError(error instanceof Error ? error.message : "Sign-up failed.");
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
		return <LoadingSpinner />;
	}

	if (auth === null) {
		return (
			<main className="w-[360px] min-h-[480px] bg-app-bg flex flex-col p-5">
				<div className="mb-6">
					<h1 className="text-base font-semibold text-text tracking-tight">PromptCompiler</h1>
					<p className="text-xs text-muted mt-0.5">
						{isSignUp ? "Create your account." : "Sign in to continue."}
					</p>
				</div>

				{sessionNotice !== null && (
					<p className="text-xs text-warning mb-3">{sessionNotice}</p>
				)}

				<div className="flex flex-col gap-2 mb-4">
					<input
						type="email"
						placeholder="Email"
						value={email}
						onChange={(e) => { setEmail(e.target.value); }}
						className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
					/>
					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => { setPassword(e.target.value); }}
						onKeyDown={(e) => { if (e.key === "Enter" && !authLoading) void (isSignUp ? handleSignUp() : handleLogin()); }}
						className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
					/>
				</div>

				{authError !== null && (
					<p className="text-xs text-error mb-3">{authError}</p>
				)}

				<button
					type="button"
					onClick={() => { void (isSignUp ? handleSignUp() : handleLogin()); }}
					disabled={authLoading}
					className="w-full py-2.5 rounded-lg bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-default text-white text-sm font-semibold transition-colors cursor-pointer mb-4"
				>
					{authLoading
						? (isSignUp ? "Creating account…" : "Signing in…")
						: (isSignUp ? "Sign up" : "Sign in")}
				</button>

				<p className="text-xs text-muted text-center">
					{isSignUp ? "Already have an account? " : "No account? "}
					<button
						type="button"
						onClick={() => { setIsSignUp(!isSignUp); setAuthError(null); }}
						className="text-brand hover:text-brand-hover underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 text-xs"
					>
						{isSignUp ? "Sign in" : "Sign up"}
					</button>
				</p>
			</main>
		);
	}

	const showUpgradeCTA =
		account.tier === "free" &&
		!account.isLoading &&
		!account.error &&
		account.usage !== null &&
		account.usage.count >= account.usage.limit;

	const userEmail = decodeJwtEmail(auth.access_token);

	return (
		<main className="w-[360px] min-h-[480px] bg-app-bg flex flex-col p-5">
			<div className="flex items-start justify-between mb-5">
				<div className="min-w-0">
					<h1 className="text-base font-semibold text-text tracking-tight">PromptCompiler</h1>
					{userEmail !== null && (
						<p className="text-[11px] text-muted mt-0.5 truncate max-w-[280px]">{userEmail}</p>
					)}
				</div>
			</div>

			<div className="flex-1">
				<ModeToggle mode={settings.mode} onChange={setMode} />
				<PauseToggle paused={paused} onToggle={togglePause} />
					<ClauseOrderingToggle ordering={clauseOrdering} onChange={setClauseOrdering} />
				<AccountStatus
					tier={account.tier}
					usage={account.usage}
					dailyReset={account.dailyReset}
					isLoading={account.isLoading}
					error={account.error}
				/>
				{account.error && !account.isLoading && (
					<p className="text-xs text-warning mb-4">
						Could not load account status. Try signing out and back in.
					</p>
				)}
				<ProjectSelector projectId={settings.projectId} onChange={setProjectId} />
				<UpgradeCTA visible={showUpgradeCTA} />
			</div>

			<button
				type="button"
				onClick={() => { void handleLogout(); }}
				className="self-end text-xs text-muted hover:text-text transition-colors cursor-pointer bg-transparent border-none p-0 mt-2"
			>
				Sign out
			</button>
		</main>
	);
}
