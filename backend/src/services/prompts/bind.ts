import type { GoalType } from "../../../../shared/contracts";

import { BIND_MODE_INSTRUCTIONS, renderInstructionBlock } from "./mode";
import type { BindPromptInput, BindPromptSection } from "./types";

export const CANONICAL_BIND_SLOT_ORDER: readonly GoalType[] = [
	"context",
	"tech_stack",
	"constraint",
	"action",
	"output_format",
	"edge_case",
] as const;

const CANONICAL_SLOT_INDEX: Record<GoalType, number> = {
	context: 1,
	tech_stack: 2,
	constraint: 3,
	action: 4,
	output_format: 5,
	edge_case: 6,
};

const MAX_SECTION_EXPANSION_CHARS = 700;
const WHITESPACE_RE = /\s+/g;
const TRUNCATION_SUFFIX = "...";

function normalizeText(text: string): string {
	return text.replace(WHITESPACE_RE, " ").trim();
}

function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}

	if (maxChars <= TRUNCATION_SUFFIX.length) {
		return TRUNCATION_SUFFIX.slice(0, maxChars);
	}

	return `${text.slice(0, maxChars - TRUNCATION_SUFFIX.length).trimEnd()}${TRUNCATION_SUFFIX}`;
}

function canonicalSort(a: BindPromptSection, b: BindPromptSection): number {
	const byGoalType = CANONICAL_SLOT_INDEX[a.goal_type] - CANONICAL_SLOT_INDEX[b.goal_type];
	if (byGoalType !== 0) {
		return byGoalType;
	}

	if (a.canonical_order !== b.canonical_order) {
		return a.canonical_order - b.canonical_order;
	}

	return normalizeText(a.expansion).localeCompare(normalizeText(b.expansion));
}

function formatCanonicalOrderLine(): string {
	return CANONICAL_BIND_SLOT_ORDER.map((goalType) => `${CANONICAL_SLOT_INDEX[goalType]}. ${goalType}`).join(" -> ");
}

export function serializeBindSections(sections: readonly BindPromptSection[]): string {
	if (sections.length === 0) {
		return "- (no sections provided)";
	}

	const lines = sections
		.slice()
		.sort(canonicalSort)
		.map((section) => {
			const normalized = normalizeText(section.expansion);
			if (normalized.length === 0) {
				return "";
			}

			const bounded = truncateText(normalized, MAX_SECTION_EXPANSION_CHARS);
			const canonicalSlot = CANONICAL_SLOT_INDEX[section.goal_type];
			return `- [slot ${canonicalSlot} | ${section.goal_type}] ${bounded}`;
		})
		.filter((line) => line.length > 0);

	if (lines.length === 0) {
		return "- (no non-empty sections provided)";
	}

	return lines.join("\n");
}

export function bindPrompt({ mode, sections }: BindPromptInput): string {
	const modeInstructionBlock = renderInstructionBlock(BIND_MODE_INSTRUCTIONS[mode]);

	return [
		"You are a prompt compiler performing the final bind pass.",
		"",
		"Canonical slot order (must be enforced exactly):",
		formatCanonicalOrderLine(),
		"",
		"Bind objectives:",
		"- Merge all sections into one coherent final prompt.",
		"- Remove duplicate or overlapping content while preserving intent.",
		"- Keep tone, terminology, and instruction hierarchy consistent.",
		"",
		"Mode-specific directives:",
		modeInstructionBlock,
		"",
		"Expanded sections (canonical sort applied):",
		serializeBindSections(sections),
		"",
		"Output requirements:",
		"- Return exactly one final prompt.",
		"- Do not include analysis, preamble, or markdown code fences.",
	].join("\n");
}