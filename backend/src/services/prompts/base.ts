import { ENHANCE_MODE_INSTRUCTIONS, renderInstructionBlock } from "./mode";
import { serializeSiblingContext } from "./siblings";
import type { GoalPromptInput } from "./types";

type GoalPromptTemplate = {
	goalType: string;
	goalIntent: string;
	goalDirectives: readonly string[];
};

const WHITESPACE_RE = /\s+/g;

function normalizeClauseText(text: string): string {
	const normalized = text.replace(WHITESPACE_RE, " ").trim();
	return normalized.length > 0 ? normalized : "(empty clause)";
}

export function buildGoalPrompt(template: GoalPromptTemplate, input: GoalPromptInput): string {
	const clauseText = normalizeClauseText(input.sectionText);
	const modeInstructionBlock = renderInstructionBlock(ENHANCE_MODE_INSTRUCTIONS[input.mode]);
	const siblingContextBlock = serializeSiblingContext(input.siblings);

	return [
		"You are a prompt compiler.",
		"Expand one clause into a clear prompt fragment while preserving user intent.",
		`Goal type: ${template.goalType}`,
		`Goal intent: ${template.goalIntent}`,
		`Source clause: ${clauseText}`,
		"",
		"Goal-specific directives:",
		...template.goalDirectives.map((line) => `- ${line}`),
		"",
		"Mode-specific directives:",
		modeInstructionBlock,
		siblingContextBlock,
		"",
		"Output requirements:",
		"- Return only the expanded prompt fragment.",
		"- Keep the wording provider-agnostic and implementation-neutral.",
		"- Do not include analysis, preamble, or markdown code fences.",
	].join("\n");
}