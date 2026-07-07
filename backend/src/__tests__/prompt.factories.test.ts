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
	efficiency: "Rewrite the clause as one or two precise imperative sentences.",
	balanced: "Rewrite the clause as one tight paragraph of imperative instructions (2-4 sentences).",
	detailed: "Rewrite the clause as a specific, comprehensive instruction block.",
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

		const contextIndex = prompt.indexOf("[slot 1 | context | ACCEPTED]");
		const edgeCaseIndex = prompt.indexOf("[slot 6 | edge_case | ACCEPTED]");
		expect(contextIndex).toBeGreaterThan(-1);
		expect(edgeCaseIndex).toBeGreaterThan(contextIndex);
	});

	it("bind prompt tags acceptance per section and instructs verbatim handling of unaccepted ones", () => {
		const prompt = bindPrompt({
			mode: "balanced",
			sections: [
				{
					canonical_order: 4,
					goal_type: "action",
					expansion: "Implement server-side pagination for the ticket list.",
					accepted: true,
				},
				{
					canonical_order: 6,
					goal_type: "edge_case",
					expansion: "handle empty inputs somehow",
					accepted: false,
				},
				{
					// Omitted `accepted` must default to ACCEPTED (v1 payload compat).
					canonical_order: 1,
					goal_type: "context",
					expansion: "This is a B2B admin console used by support teams.",
				},
			],
		});

		expect(prompt).toContain("[slot 1 | context | ACCEPTED]");
		expect(prompt).toContain("[slot 4 | action | ACCEPTED]");
		expect(prompt).toContain("[slot 6 | edge_case | UNACCEPTED] handle empty inputs somehow");
		expect(prompt).toContain("UNACCEPTED sections were NOT reviewed by the user");
	});

	// BE-QUAL-1 regression pins: the bind pass compiles instead of concatenating
	// (observed failure: one heading per slot, expansions pasted verbatim in
	// third-person narrative), and enhance sharpens instead of padding
	// (observed failure: invented versions/tools under boilerplate headers).
	it("bind prompt pins the anti-stitching and anti-invention objectives", () => {
		const prompt = bindPrompt({
			mode: "balanced",
			sections: [{ canonical_order: 4, goal_type: "action", expansion: "Build the toggle." }],
		});

		expect(prompt).toContain("Rewrite, do not stitch");
		expect(prompt).toContain("Do not mirror the slot structure as output structure");
		expect(prompt).toContain("imperative voice");
		expect(prompt).toContain("Do not invent requirements, versions, tools, or scope that no section states.");
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