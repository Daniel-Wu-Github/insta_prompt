import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AuthTokenResponse, Tier } from "../../../shared/contracts";

const DEFAULT_TIER: Tier = "free";
const TIER_VALUES: readonly Tier[] = ["free", "pro", "byok"];

export type VerifiedAuthContext = {
	userId: string;
	tier: Tier;
};

export type RefreshTokenProxyResult =
	| {
			ok: true;
			data: AuthTokenResponse;
	  }
	| {
			ok: false;
			status: 401 | 500;
			code: "UNAUTHORIZED" | "INTERNAL_ERROR";
			message: string;
	  };

let cachedClient: SupabaseClient | null = null;

function getEnvVar(...names: Array<"SUPABASE_URL" | "API_URL" | "SUPABASE_SERVICE_KEY" | "SERVICE_ROLE_KEY">): string | null {
	for (const name of names) {
		const value = process.env[name];
		if (typeof value !== "string") {
			continue;
		}

		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}

	return null;
}

function getSupabaseClient(): SupabaseClient | null {
	if (cachedClient) {
		return cachedClient;
	}

	const supabaseUrl = getEnvVar("SUPABASE_URL", "API_URL");
	const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_KEY", "SERVICE_ROLE_KEY");
	if (!supabaseUrl || !supabaseServiceKey) {
		return null;
	}

	cachedClient = createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});

	return cachedClient;
}

function isTier(value: unknown): value is Tier {
	return typeof value === "string" && TIER_VALUES.includes(value as Tier);
}

async function resolveTierForUser(supabase: SupabaseClient, userId: string): Promise<Tier | null> {
	const { data, error } = await supabase.from("profiles").select("tier").eq("id", userId).maybeSingle();
	if (error || !data || typeof data !== "object") {
		return null;
	}

	const tierValue = (data as { tier?: unknown }).tier;
	return isTier(tierValue) ? tierValue : null;
}

export async function verifyBearerToken(token: string): Promise<VerifiedAuthContext | null> {
	const supabase = getSupabaseClient();
	if (!supabase) {
		return null;
	}

	const { data, error } = await supabase.auth.getUser(token);
	if (error || !data.user) {
		return null;
	}

	const tier = (await resolveTierForUser(supabase, data.user.id)) ?? DEFAULT_TIER;

	return {
		userId: data.user.id,
		tier,
	};
}

export async function refreshAndVerifySession(refreshToken: string): Promise<RefreshTokenProxyResult> {
	const supabase = getSupabaseClient();
	if (!supabase) {
		return {
			ok: false,
			status: 500,
			code: "INTERNAL_ERROR",
			message: "Auth service unavailable",
		};
	}

	const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
		refresh_token: refreshToken,
	});

	const session = refreshData.session;
	const accessJwt = session?.access_token;
	if (refreshError || !session || !accessJwt) {
		return {
			ok: false,
			status: 401,
			code: "UNAUTHORIZED",
			message: "Invalid refresh token",
		};
	}

	const { data: userData, error: userError } = await supabase.auth.getUser(accessJwt);
	if (userError || !userData.user) {
		return {
			ok: false,
			status: 401,
			code: "UNAUTHORIZED",
			message: "Invalid refresh token",
		};
	}

	const tier = (await resolveTierForUser(supabase, userData.user.id)) ?? DEFAULT_TIER;

	return {
		ok: true,
		data: {
			token: accessJwt,
			token_type: "bearer",
			expires_in: typeof session.expires_in === "number" ? session.expires_in : 3600,
			refresh_token: session.refresh_token ?? null,
			user_id: userData.user.id,
			tier,
		},
	};
}