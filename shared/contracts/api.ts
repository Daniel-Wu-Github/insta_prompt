import type { Mode, Section, Tier } from "./domain";

export interface SegmentRequest {
  segments: string[];
  mode: Mode;
}

export interface SegmentResponse {
  sections: Section[];
}

export interface EnhanceRequest {
  section: Pick<Section, "id" | "text" | "goal_type">;
  siblings: Array<Pick<Section, "id" | "text" | "goal_type">>;
  mode: Mode;
  project_id: string | null;
}

export interface BindRequest {
  // BIND-DESIGN-1 Option E (contract v1.1, additive): `accepted` marks whether
  // the user explicitly accepted the clause. Unaccepted sections are passed
  // through near-verbatim in canonical position instead of being destroyed by
  // the commit. Omitted ⇒ true (v1 clients sent accepted sections only).
  sections: Array<Pick<Section, "canonical_order" | "goal_type"> & { expansion: string; accepted?: boolean }>;
  mode: Mode;
}

export interface AuthTokenRequest {
  // Supabase refresh token used by backend refresh-session proxy.
  refresh_token: string;
}

export interface AuthTokenResponse {
  // Fixed response contract for extension session handoff.
  token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token: string | null;
  user_id: string;
  tier: Tier;
}

export interface ProjectContextChunk {
  file_path: string;
  content: string;
}

export interface ProjectContextRequest {
  chunks: ProjectContextChunk[];
}
