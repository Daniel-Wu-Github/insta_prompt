import type { Mode } from "../../../../shared/contracts";

export const ENHANCE_MODE_INSTRUCTIONS: Record<Mode, readonly string[]> = {
	efficiency: [
		"Keep the output concise: one compact paragraph.",
		"Prioritize clarity and directness over elaboration.",
		"Include only the minimum required constraints and deliverable shape.",
	],
	balanced: [
		"Use a structured response with 2-3 short sections.",
		"Capture key constraints, expected behavior, and output shape.",
		"Prefer explicit instructions over implied assumptions.",
	],
	detailed: [
		"Produce a comprehensive, highly specific prompt fragment.",
		"Include explicit constraints, success criteria, and edge-case intent.",
		"Use a strongly structured format suitable for direct binding.",
	],
};

export const BIND_MODE_INSTRUCTIONS: Record<Mode, readonly string[]> = {
	efficiency: [
		"Keep the final prompt short and direct.",
		"Preserve only high-value details and non-negotiable constraints.",
	],
	balanced: [
		"Return a clear, multi-part markdown prompt.",
		"Preserve important detail while avoiding repetitive phrasing.",
	],
	detailed: [
		"Return a deeply structured final prompt with explicit sections.",
		"Retain nuanced constraints, dependencies, and edge-case guidance.",
	],
};

export function renderInstructionBlock(lines: readonly string[]): string {
	return lines.map((line) => `- ${line}`).join("\n");
}