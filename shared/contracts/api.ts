import type { Mode, Section } from "./domain";

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
  sections: Array<Pick<Section, "canonical_order" | "goal_type"> & { expansion: string }>;
  mode: Mode;
}

export interface AuthTokenRequest {
  refresh_token?: string;
}

export interface ProjectContextChunk {
  file_path: string;
  content: string;
}

export interface ProjectContextRequest {
  chunks: ProjectContextChunk[];
}
