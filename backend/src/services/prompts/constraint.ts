import { buildGoalPrompt } from "./base";
import type { GoalPromptInput } from "./types";

const CONSTRAINT_DIRECTIVES = [
	"Extract non-negotiable rules, prohibitions, and guardrails.",
	"Preserve strict wording for hard constraints when available.",
	"Avoid weakening constraints into optional recommendations.",
] as const;

export function constraintPrompt(input: GoalPromptInput): string {
	return buildGoalPrompt(
		{
			goalType: "constraint",
			goalIntent: "Encode hard limits and policy boundaries for execution.",
			goalDirectives: CONSTRAINT_DIRECTIVES,
		},
		input,
	);
}