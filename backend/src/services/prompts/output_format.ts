import { buildGoalPrompt } from "./base";
import type { GoalPromptInput } from "./types";

const OUTPUT_FORMAT_DIRECTIVES = [
	"Describe the expected response shape with explicit structure hints.",
	"Specify ordering, sections, or schema-like requirements when present.",
	"State formatting expectations clearly so outputs are easy to validate.",
] as const;

export function outputFormatPrompt(input: GoalPromptInput): string {
	return buildGoalPrompt(
		{
			goalType: "output_format",
			goalIntent: "Define how the final response should be organized and formatted.",
			goalDirectives: OUTPUT_FORMAT_DIRECTIVES,
		},
		input,
	);
}