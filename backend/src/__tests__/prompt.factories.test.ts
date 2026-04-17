import { describe, expect, it } from "bun:test";

import type { GoalType, Mode } from "../../../shared/contracts";

import {
	CANONICAL_BIND_SLOT_ORDER,
	SIBLING_CONTEXT_LIMITS,
	bindPrompt,
	createGoalPrompt,
	goalPromptFactories,
	serializeSiblingContext,
} from "../services/prompts";
import { selectModel } from "../services/llm";

const GOAL_TYPES: GoalType[] = [
	"context",
	"tech_stack",
	"constraint",
	"action",
	"output_format",
	"edge_case",
];

const MODES: Mode[] = ["efficiency", "balanced", "detailed"];

const EXPECTED_MODE_SNIPPETS: Record<Mode, string> = {
	efficiency: "Keep the output concise: one compact paragraph.",
	balanced: "Use a structured response with 2-3 short sections.",
	detailed: "Produce a comprehensive, highly specific prompt fragment.",
};

const EXPECTED_MODE_TOKEN_BUDGETS: Record<Mode, number> = {
	efficiency: 150,
	balanced: 500,
	detailed: 1000,
};

describe("prompt factories", () => {
	it("exposes a goal factory for each required goal type", () => {
		for (const goalType of GOAL_TYPES) {
			expect(goalPromptFactories[goalType]).toBeDefined();
		}
	});

	it("returns deterministic mode-specific prompts for each goal type", () => {
		for (const goalType of GOAL_TYPES) {
			for (const mode of MODES) {
				const input = {
					sectionText: "Build a deployment-safe dark mode toggle with keyboard shortcuts.",
					mode,
					siblings: [
						{
							id: "s2",
							goal_type: "tech_stack" as const,
							text: "Use React and TypeScript.",
						},
					],
				};

				const first = createGoalPrompt(goalType, input);
				const second = createGoalPrompt(goalType, input);

				expect(first).toBe(second);
				expect(first).toContain(`Goal type: ${goalType}`);
				expect(first).toContain(EXPECTED_MODE_SNIPPETS[mode]);
				expect(first.toLowerCase()).not.toContain("anthropic");
				expect(first.toLowerCase()).not.toContain("groq");

				const selected = selectModel({
					callType: "enhance",
					tier: "free",
					mode,
				});
				expect(selected.maxTokens).toBe(EXPECTED_MODE_TOKEN_BUDGETS[mode]);
			}
		}
	});

	it("injects sibling context only when siblings are present", () => {
		const withoutSiblings = createGoalPrompt("action", {
			sectionText: "Implement server-side pagination.",
			mode: "balanced",
			siblings: [],
		});

		const withSiblings = createGoalPrompt("action", {
			sectionText: "Implement server-side pagination.",
			mode: "balanced",
			siblings: [
				{
					id: "s3",
					goal_type: "constraint",
					text: "Do not introduce new external dependencies.",
				},
			],
		});

		expect(withoutSiblings).not.toContain("Sibling context (for coherence only; do not copy verbatim):");
		expect(withSiblings).toContain("Sibling context (for coherence only; do not copy verbatim):");
		expect(withSiblings).toContain("- [constraint] Do not introduce new external dependencies.");
	});

	it("applies deterministic sibling serialization bounds", () => {
		const oversizedSiblings = Array.from({ length: 12 }, (_, index) => ({
			id: `s${index + 1}`,
			goal_type: "edge_case" as const,
			text: `edge case ${index + 1} ${"very-long-token ".repeat(30)}`,
		}));

		const serialized = serializeSiblingContext(oversizedSiblings);
		const siblingLines = serialized.split("\n").filter((line) => line.startsWith("- ["));

		expect(siblingLines.length).toBeLessThanOrEqual(SIBLING_CONTEXT_LIMITS.MAX_SIBLINGS);
		expect(serialized).toContain("...");
	});

	it("bind prompt encodes canonical ordering and dedup/coherence intent", () => {
		const prompt = bindPrompt({
			mode: "balanced",
			sections: [
				{
					canonical_order: 6,
					goal_type: "edge_case",
					expansion: "Handle empty-state and retry-timeout behavior.",
				},
				{
					canonical_order: 1,
					goal_type: "context",
					expansion: "This is a B2B admin console used by support teams.",
				},
			],
		});

		expect(prompt).toContain("Canonical slot order (must be enforced exactly):");
		expect(prompt).toContain(
			"1. context -> 2. tech_stack -> 3. constraint -> 4. action -> 5. output_format -> 6. edge_case",
		);
		expect(prompt).toContain("Remove duplicate or overlapping content while preserving intent.");

		const contextIndex = prompt.indexOf("[slot 1 | context]");
		const edgeCaseIndex = prompt.indexOf("[slot 6 | edge_case]");
		expect(contextIndex).toBeGreaterThan(-1);
		expect(edgeCaseIndex).toBeGreaterThan(contextIndex);
	});

	it("keeps canonical bind slot order stable", () => {
		expect(CANONICAL_BIND_SLOT_ORDER).toEqual([
			"context",
			"tech_stack",
			"constraint",
			"action",
			"output_format",
			"edge_case",
		]);
	});
});