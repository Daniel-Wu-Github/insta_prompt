import { buildGoalPrompt } from "./base";
import type { GoalPromptInput } from "./types";

const TECH_STACK_DIRECTIVES = [
	"State exactly the languages, frameworks, runtimes, and tools the clause names — no more.",
	"Never add technologies, package managers, or version requirements the clause does not mention.",
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