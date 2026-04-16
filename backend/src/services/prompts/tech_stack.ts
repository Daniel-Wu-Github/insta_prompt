import { buildGoalPrompt } from "./base";
import type { GoalPromptInput } from "./types";

const TECH_STACK_DIRECTIVES = [
	"Name required languages, frameworks, runtimes, and key tools explicitly.",
	"Clarify compatibility or version expectations when implied by the clause.",
	"Separate hard technical requirements from optional preferences.",
] as const;

export function techStackPrompt(input: GoalPromptInput): string {
	return buildGoalPrompt(
		{
			goalType: "tech_stack",
			goalIntent: "Specify implementation technology expectations.",
			goalDirectives: TECH_STACK_DIRECTIVES,
		},
		input,
	);
}