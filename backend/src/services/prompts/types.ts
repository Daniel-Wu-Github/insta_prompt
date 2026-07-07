import type { GoalType, Mode, Section } from "../../../shared/contracts";

export type PromptSibling = Pick<Section, "id" | "text" | "goal_type">;

export type GoalPromptInput = {
	sectionText: string;
	mode: Mode;
	siblings?: PromptSibling[] | null;
};

export type BindPromptSection = Pick<Section, "canonical_order" | "goal_type"> & {
	expansion: string;
	// Option E: omitted ⇒ accepted (backward-compatible with v1 payloads).
	accepted?: boolean;
};

export type BindPromptInput = {
	mode: Mode;
	sections: BindPromptSection[];
};

export type GoalPromptFactory = (input: GoalPromptInput) => string;

export type GoalPromptFactoryMap = Record<GoalType, GoalPromptFactory>;