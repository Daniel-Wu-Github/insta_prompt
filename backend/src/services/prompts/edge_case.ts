import { buildGoalPrompt } from "./base";
import type { GoalPromptInput } from "./types";

const EDGE_CASE_DIRECTIVES = [
	"Identify important failure modes, unusual inputs, and boundary conditions.",
	"State expected handling behavior for each edge condition explicitly.",
	"Prioritize practical safeguards over hypothetical extremes.",
] as const;

export function edgeCasePrompt(input: GoalPromptInput): string {
	return buildGoalPrompt(
		{
			goalType: "edge_case",
			goalIntent: "Capture defensive handling for corner-case scenarios.",
			goalDirectives: EDGE_CASE_DIRECTIVES,
		},
		input,
	);
}