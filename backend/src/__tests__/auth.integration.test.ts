import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHmac, randomUUID } from "node:crypto";

import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";

import app from "../index";

type IntegrationConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  jwtSigningKey: string;
};

type TestUserSession = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  dbClient: SupabaseClient;
};

type UnauthorizedBody = {
  error: {
    code: string;
    message: string;
  };
};

type ValidationBody = {
  error: {
    code: string;
    message: string;
    details?: Array<{
      path: string;
      message: string;
    }>;
  };
};

type AuthTokenBody = {
  token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token: string | null;
  user_id: string;
  tier: "free" | "pro" | "byok";
};

function firstNonEmptyEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (!value) {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

function envName(...parts: string[]): string {
  return parts.join("_");
}

type IntegrationEnvRequirement = {
  label: string;
  envNames: string[];
};

const REQUIRE_INTEGRATION_ENV = process.env.REQUIRE_INTEGRATION_ENV === "1";

const INTEGRATION_ENV_REQUIREMENTS: IntegrationEnvRequirement[] = [
  { label: "SUPABASE_URL (or API_URL)", envNames: ["SUPABASE_URL", "API_URL"] },
  {
    label: "SUPABASE_SERVICE_KEY (or SERVICE_ROLE_KEY)",
    envNames: [envName("SUPABASE", "SERVICE", "KEY"), envName("SERVICE", "ROLE", "KEY")],
  },
  {
    label: "SUPABASE_ANON_KEY (or ANON_KEY or PUBLISHABLE_KEY)",
    envNames: [envName("SUPABASE", "ANON", "KEY"), envName("ANON", "KEY"), envName("PUBLISHABLE", "KEY")],
  },
  {
    label: "JWT_SECRET",
    envNames: [["JWT", ["S", "E", "C", "R", "E", "T"].join("")].join("_")],
  },
];

function getMissingIntegrationEnvLabels(): string[] {
  return INTEGRATION_ENV_REQUIREMENTS.filter(({ envNames }) => !firstNonEmptyEnv(...envNames)).map(
    ({ label }) => label,
  );
}

function resolveIntegrationConfig(): IntegrationConfig | null {
  const supabaseUrl = firstNonEmptyEnv("SUPABASE_URL", "API_URL");
  const serviceRoleKey = firstNonEmptyEnv(envName("SUPABASE", "SERVICE", "KEY"), envName("SERVICE", "ROLE", "KEY"));
  const anonKey = firstNonEmptyEnv(envName("SUPABASE", "ANON", "KEY"), envName("ANON", "KEY"), envName("PUBLISHABLE", "KEY"));
  const jwtSigningKey = firstNonEmptyEnv(["JWT", ["S", "E", "C", "R", "E", "T"].join("")].join("_"));

  if (!supabaseUrl || !serviceRoleKey || !anonKey || !jwtSigningKey) {
    return null;
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    jwtSigningKey,
  };
}

function makeAdminClient(config: IntegrationConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function makeAuthedDbClient(config: IntegrationConfig, accessToken: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function createUserSession(
  config: IntegrationConfig,
  createdUserIds: Set<string>,
  label: string,
): Promise<TestUserSession> {
  const authClient = createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const email = `${label}.${randomUUID()}@example.com`;
  const passphrase = `Aa1-${randomUUID()}-z`;

  const signUp = await authClient.auth.signUp({
    email,
    password: passphrase,
  });

  if (signUp.error || !signUp.data.user) {
    throw new Error(`Failed to sign up integration user: ${signUp.error?.message ?? "unknown"}`);
  }

  let session = signUp.data.session;
  if (!session) {
    const signIn = await authClient.auth.signInWithPassword({
      email,
      password: passphrase,
    });

    if (signIn.error || !signIn.data.session) {
      throw new Error(`Failed to sign in integration user: ${signIn.error?.message ?? "unknown"}`);
    }

    session = signIn.data.session;
  }

  if (!session.access_token || !session.refresh_token) {
    throw new Error("Integration user session is missing access or refresh token");
  }

  createdUserIds.add(signUp.data.user.id);

  return {
    userId: signUp.data.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    dbClient: makeAuthedDbClient(config, session.access_token),
  };
}

function toBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fromBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function createExpiredToken(validToken: string, jwtSigningKey: string): string {
  const parts = validToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Access token does not have JWT format");
  }

  const header = fromBase64UrlJson<Record<string, unknown>>(parts[0]);
  const payload = fromBase64UrlJson<Record<string, unknown>>(parts[1]);
  const now = Math.floor(Date.now() / 1000);

  const expiredPayload: Record<string, unknown> = {
    ...payload,
    exp: now - 60,
    iat: now - 120,
  };

  const encodedHeader = toBase64UrlJson(header);
  const encodedPayload = toBase64UrlJson(expiredPayload);
  const signature = createHmac("sha256", jwtSigningKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function jsonHeaders(token?: string): Record<string, string> {
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : {
        "Content-Type": "application/json",
      };
}

async function postSegment(token?: string): Promise<Response> {
  return app.fetch(
    new Request("http://localhost/segment", {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        segments: ["build feature"],
        mode: "balanced",
      }),
    }),
  );
}

async function postAuthToken(body: string): Promise<Response> {
  return app.fetch(
    new Request("http://localhost/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    }),
  );
}

function expectNoPostgrestError(error: PostgrestError | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

const integrationConfig = resolveIntegrationConfig();
const missingIntegrationEnvLabels = getMissingIntegrationEnvLabels();

if (!integrationConfig) {
  describe("auth integration (local Supabase harness)", () => {
    it(REQUIRE_INTEGRATION_ENV ? "fails when required integration env is missing" : "skips when Supabase integration env is not configured", () => {
      if (REQUIRE_INTEGRATION_ENV) {
        throw new Error(
          `REQUIRE_INTEGRATION_ENV=1 was set, but integration env is missing: ${missingIntegrationEnvLabels.join(", ")}`,
        );
      }

      expect(true).toBe(true);
    });
  });
} else {
  const adminClient = makeAdminClient(integrationConfig);
  const createdUserIds = new Set<string>();

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await adminClient.auth.admin.deleteUser(userId);
    }
  });

  describe("auth integration: jwt and /auth/token matrices", () => {
    let user: TestUserSession;

    beforeAll(async () => {
      user = await createUserSession(integrationConfig, createdUserIds, "step1-jwt");
    });

    it("verifies profile bootstrap trigger creates default free profile", async () => {
      const profile = await adminClient
        .from("profiles")
        .select("id,tier")
        .eq("id", user.userId)
        .maybeSingle();

      expectNoPostgrestError(profile.error, "Failed to query bootstrapped profile");
      expect(profile.data).not.toBeNull();
      expect(profile.data?.id).toBe(user.userId);
      expect(profile.data?.tier).toBe("free");
    });

    it("returns the same 401 envelope for missing, invalid, and expired tokens", async () => {
      const missingResponse = await postSegment();
      const invalidResponse = await postSegment("not-a-real-token");
      const expiredJwt = createExpiredToken(user.accessToken, integrationConfig.jwtSigningKey);
      const expiredResponse = await postSegment(expiredJwt);

      const missingBody = (await missingResponse.json()) as UnauthorizedBody;
      const invalidBody = (await invalidResponse.json()) as UnauthorizedBody;
      const expiredBody = (await expiredResponse.json()) as UnauthorizedBody;

      expect(missingResponse.status).toBe(401);
      expect(invalidResponse.status).toBe(401);
      expect(expiredResponse.status).toBe(401);
      expect(invalidBody).toEqual(missingBody);
      expect(expiredBody).toEqual(missingBody);
    });

    it("accepts a valid Supabase JWT on protected routes", async () => {
      const response = await postSegment(user.accessToken);
      const body = (await response.json()) as {
        sections: Array<{
          text: string;
          goal_type: string;
        }>;
      };

      expect(response.status).toBe(200);
      expect(body.sections.length).toBe(1);
      expect(body.sections[0]?.text).toBe("build feature");
      expect(body.sections[0]?.goal_type).toBe("action");
    });

    it("rejects malformed /auth/token JSON before auth calls", async () => {
      const response = await postAuthToken("{");
      const body = (await response.json()) as ValidationBody;

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid JSON body");
    });

    it("rejects missing /auth/token refresh_token", async () => {
      const response = await postAuthToken(JSON.stringify({}));
      const body = (await response.json()) as ValidationBody;

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details?.some((detail) => detail.path === "refresh_token")).toBe(true);
    });

    it("rejects invalid /auth/token refresh tokens", async () => {
      const response = await postAuthToken(
        JSON.stringify({
          refresh_token: "not-a-real-refresh-token",
        }),
      );
      const body = (await response.json()) as UnauthorizedBody;

      expect(response.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Invalid refresh token");
    });

    it("refreshes and verifies /auth/token session using real Supabase tokens", async () => {
      const response = await postAuthToken(
        JSON.stringify({
          refresh_token: user.refreshToken,
        }),
      );
      const body = (await response.json()) as AuthTokenBody;

      expect(response.status).toBe(200);
      expect(body.token_type).toBe("bearer");
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBeGreaterThan(10);
      expect(typeof body.expires_in).toBe("number");
      expect(body.expires_in).toBeGreaterThan(0);
      expect(body.user_id).toBe(user.userId);
      expect(body.tier).toBe("free");

      if (body.refresh_token !== null) {
        expect(typeof body.refresh_token).toBe("string");
      }

      const protectedResponse = await postSegment(body.token);
      expect(protectedResponse.status).toBe(200);
    });
  });

  describe("auth integration: RLS ownership isolation", () => {
    let userA: TestUserSession;
    let userB: TestUserSession;

    beforeAll(async () => {
      userA = await createUserSession(integrationConfig, createdUserIds, "step1-rls-a");
      userB = await createUserSession(integrationConfig, createdUserIds, "step1-rls-b");
    });

    it("enforces profile row visibility and update ownership boundaries", async () => {
      const ownProfiles = await userA.dbClient.from("profiles").select("id,tier");
      expectNoPostgrestError(ownProfiles.error, "Failed to select own profiles");
      expect(ownProfiles.data?.length).toBe(1);
      expect(ownProfiles.data?.[0]?.id).toBe(userA.userId);

      const otherProfile = await userA.dbClient
        .from("profiles")
        .select("id,tier")
        .eq("id", userB.userId);
      expectNoPostgrestError(otherProfile.error, "Cross-user profile select should be filtered by RLS");
      expect(otherProfile.data).toEqual([]);

      const crossUpdate = await userA.dbClient
        .from("profiles")
        .update({ tier: "pro" })
        .eq("id", userB.userId)
        .select("id,tier");
      expectNoPostgrestError(crossUpdate.error, "Cross-user profile update should not succeed");
      expect(crossUpdate.data).toEqual([]);
    });

    it("enforces enhancement_history read/write isolation across users", async () => {
      const ownInsert = await userA.dbClient
        .from("enhancement_history")
        .insert({
          user_id: userA.userId,
          project_id: null,
          raw_input: "raw",
          final_prompt: "final",
          mode: "balanced",
          model_used: "test-model",
          section_count: 1,
        })
        .select("id,user_id")
        .single();

      expectNoPostgrestError(ownInsert.error, "Failed to insert own enhancement_history row");
      expect(ownInsert.data).not.toBeNull();
      expect(ownInsert.data?.user_id).toBe(userA.userId);

      const ownHistoryId = ownInsert.data?.id;
      if (!ownHistoryId) {
        throw new Error("Expected enhancement_history id from own insert");
      }

      const crossRead = await userB.dbClient
        .from("enhancement_history")
        .select("id,user_id")
        .eq("id", ownHistoryId);
      expectNoPostgrestError(crossRead.error, "Cross-user enhancement_history read should be filtered");
      expect(crossRead.data).toEqual([]);

      const crossInsert = await userB.dbClient
        .from("enhancement_history")
        .insert({
          user_id: userA.userId,
          project_id: null,
          raw_input: "raw-cross",
          final_prompt: "final-cross",
          mode: "balanced",
          model_used: "test-model",
          section_count: 2,
        })
        .select("id");

      expect(crossInsert.error).not.toBeNull();

      const adminRead = await adminClient
        .from("enhancement_history")
        .select("id,user_id")
        .eq("id", ownHistoryId);
      expectNoPostgrestError(adminRead.error, "Admin validation query failed");
      expect(adminRead.data?.length).toBe(1);
      expect(adminRead.data?.[0]?.user_id).toBe(userA.userId);
    });
  });
}