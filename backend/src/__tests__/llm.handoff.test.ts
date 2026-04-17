import { describe, expect, it } from "bun:test";

import {
	assembleBindTemplate,
	assembleEnhanceTemplate,
	prepareBindServiceHandoff,
	prepareEnhanceServiceHandoff,
} from "../services/llm";

describe("llm service handoff helpers", () => {
	it("assembles deterministic enhance templates from goal-type and mode", () => {
		const first = assembleEnhanceTemplate({
			goalType: "action",
			sectionText: "Build a dark mode toggle.",
			mode: "balanced",
			siblings: [
				{
					id: "s2",
					goal_type: "tech_stack",
					text: "Use React and TypeScript.",
				},
			],
		});

		const second = assembleEnhanceTemplate({
			goalType: "action",
			sectionText: "Build a dark mode toggle.",
			mode: "balanced",
			siblings: [
				{
					id: "s2",
					goal_type: "tech_stack",
					text: "Use React and TypeScript.",
				},
			],
		});

		expect(first).toBe(second);
		expect(first).toContain("Goal type: action");
		expect(first).toContain("Use a structured response with 2-3 short sections.");
	});

	it("enforces canonical bind ordering semantics during bind-template assembly", () => {
		const assembled = assembleBindTemplate({
			mode: "balanced",
			sections: [
				{
					canonical_order: 6,
					goal_type: "edge_case",
					expansion: "Handle empty inputs.",
				},
				{
					canonical_order: 99,
					goal_type: "action",
					expansion: "Implement server-side pagination.",
				},
				{
					canonical_order: -1,
					goal_type: "context",
					expansion: "Dashboard for support operators.",
				},
			],
		});

		expect(assembled.canonicalSections.map((section) => section.goal_type)).toEqual([
			"context",
			"action",
			"edge_case",
		]);
		expect(assembled.canonicalSections.map((section) => section.canonical_order)).toEqual([1, 4, 6]);

		const contextIndex = assembled.prompt.indexOf("[slot 1 | context]");
		const actionIndex = assembled.prompt.indexOf("[slot 4 | action]");
		const edgeCaseIndex = assembled.prompt.indexOf("[slot 6 | edge_case]");

		expect(contextIndex).toBeGreaterThan(-1);
		expect(actionIndex).toBeGreaterThan(contextIndex);
		expect(edgeCaseIndex).toBeGreaterThan(actionIndex);
	});

	it("prepares enhance handoff with model selection and prompt assembly", () => {
		const handoff = prepareEnhanceServiceHandoff({
			route: {
				callType: "enhance",
				tier: "pro",
				mode: "efficiency",
			},
			template: {
				goalType: "constraint",
				sectionText: "Do not introduce new dependencies.",
				mode: "efficiency",
				siblings: [],
			},
		});

		expect(handoff.model.provider).toBe("anthropic");
		expect(handoff.model.model).toBe("claude-haiku-4-5-20251001");
		expect(handoff.prompt).toContain("Goal type: constraint");
	});

	it("prepares bind handoff with canonical sections and selected model", () => {
		const handoff = prepareBindServiceHandoff({
			route: {
				callType: "bind",
				tier: "free",
				mode: "detailed",
			},
			template: {
				mode: "detailed",
				sections: [
					{
						canonical_order: 6,
						goal_type: "edge_case",
						expansion: "Fallback if cache misses.",
					},
					{
						canonical_order: 1,
						goal_type: "context",
						expansion: "This app is internal-only.",
					},
				],
			},
		});

		expect(handoff.model.provider).toBe("groq");
		expect(handoff.model.model).toBe("llama-3.3-70b-versatile");
		expect(handoff.canonicalSections.map((section) => section.goal_type)).toEqual([
			"context",
			"edge_case",
		]);
		expect(handoff.prompt).toContain("Canonical slot order (must be enforced exactly):");
	});
});