export const GOAL_TYPE_VALUES = [
  "context",
  "tech_stack",
  "constraint",
  "action",
  "output_format",
  "edge_case",
] as const;

export type GoalType = (typeof GOAL_TYPE_VALUES)[number];

export const MODE_VALUES = ["efficiency", "balanced", "detailed"] as const;

export type Mode = (typeof MODE_VALUES)[number];

export const TIER_VALUES = ["free", "pro", "byok"] as const;

export type Tier = (typeof TIER_VALUES)[number];

export const SECTION_STATUS_VALUES = [
  "idle",
  "streaming",
  "ready",
  "accepted",
  "stale",
] as const;

export type SectionStatus = (typeof SECTION_STATUS_VALUES)[number];

export const TAB_STATUS_VALUES = [
  "IDLE",
  "TYPING",
  "SEGMENTING",
  "PREVIEWING",
  "ACCEPTING",
  "BINDING",
  "BINDING_COMPLETE",
] as const;

export type TabStatus = (typeof TAB_STATUS_VALUES)[number];

export interface Section {
  id: string;
  text: string;
  goal_type: GoalType;
  canonical_order: number;
  confidence: number;
  depends_on: string[];
  expansion?: string;
  status?: SectionStatus;
}

export interface TabState {
  tabId: number;
  status: TabStatus;
  rawText: string;
  sections: Section[];
  acceptedIds: string[];
  boundPrompt: string | null;
}
