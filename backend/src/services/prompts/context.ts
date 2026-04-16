import { buildGoalPrompt } from "./base";
import type { GoalPromptInput } from "./types";

const CONTEXT_DIRECTIVES = [
	"Capture relevant background, domain assumptions, and current state.",
	"Highlight information that changes interpretation of downstream clauses.",
	"Avoid introducing speculative details that are not present in the source.",
] as const;

export function contextPrompt(input: GoalPromptInput): string {
	return buildGoalPrompt(
		{
			goalType: "context",
			goalIntent: "Provide situational framing for the final compiled prompt.",
			goalDirectives: CONTEXT_DIRECTIVES,
		},
		input,
	);
}