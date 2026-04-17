import type { GoalType } from "../../../../shared/contracts";

import { actionPrompt } from "./action";
import { bindPrompt } from "./bind";
import { constraintPrompt } from "./constraint";
import { contextPrompt } from "./context";
import { edgeCasePrompt } from "./edge_case";
import { outputFormatPrompt } from "./output_format";
import { techStackPrompt } from "./tech_stack";
import type { GoalPromptFactoryMap, GoalPromptInput } from "./types";

export {
	bindPrompt,
	CANONICAL_BIND_SLOT_ORDER,
	canonicalizeBindSections,
	canonicalSlotForGoalType,
	serializeBindSections,
} from "./bind";
export { BIND_MODE_INSTRUCTIONS, ENHANCE_MODE_INSTRUCTIONS } from "./mode";
export { SIBLING_CONTEXT_LIMITS, serializeSiblingContext } from "./siblings";
export type {
	BindPromptInput,
	BindPromptSection,
	GoalPromptFactory,
	GoalPromptFactoryMap,
	GoalPromptInput,
	PromptSibling,
} from "./types";

export const goalPromptFactories: GoalPromptFactoryMap = {
	context: contextPrompt,
	tech_stack: techStackPrompt,
	constraint: constraintPrompt,
	action: actionPrompt,
	output_format: outputFormatPrompt,
	edge_case: edgeCasePrompt,
};

export function createGoalPrompt(goalType: GoalType, input: GoalPromptInput): string {
	return goalPromptFactories[goalType](input);
}