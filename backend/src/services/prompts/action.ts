import { buildGoalPrompt } from "./base";
import type { GoalPromptInput } from "./types";

const ACTION_DIRECTIVES = [
	"Translate the requested task into concrete, executable intent.",
	"Include measurable success criteria for the requested outcome.",
	"Keep the task scoped to what the source clause actually asks for.",
] as const;

export function actionPrompt(input: GoalPromptInput): string {
	return buildGoalPrompt(
		{
			goalType: "action",
			goalIntent: "Define the primary work that should be performed.",
			goalDirectives: ACTION_DIRECTIVES,
		},
		input,
	);
}