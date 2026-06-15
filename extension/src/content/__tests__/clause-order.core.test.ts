import { describe, expect, it } from "vitest";
import {
	CANONICAL_ORDER_BY_GOAL_TYPE,
	GOAL_TYPES_IN_CANONICAL_ORDER,
	canonicalSlotForGoalType,
	sortByCanonicalOrder,
} from "../../../../packages/core";
import { GOAL_TYPE_VALUES, type GoalType } from "../../../../shared/contracts";

describe("packages/core clause-order (Track C1 extraction)", () => {
	it("maps every goal_type to exactly one slot, matching the canonical policy", () => {
		expect(CANONICAL_ORDER_BY_GOAL_TYPE).toEqual({
			context: 1,
			tech_stack: 2,
			constraint: 3,
			action: 4,
			output_format: 5,
			edge_case: 6,
		});
		for (const g of GOAL_TYPE_VALUES) {
			expect(canonicalSlotForGoalType(g)).toBe(CANONICAL_ORDER_BY_GOAL_TYPE[g]);
		}
	});

	it("orders goal types context → edge_case", () => {
		expect(GOAL_TYPES_IN_CANONICAL_ORDER).toEqual([
			"context",
			"tech_stack",
			"constraint",
			"action",
			"output_format",
			"edge_case",
		]);
	});

	it("sorts out-of-order sections by canonical slot (client order not trusted)", () => {
		const sections: Array<{ id: string; goal_type: GoalType }> = [
			{ id: "a", goal_type: "edge_case" },
			{ id: "b", goal_type: "context" },
			{ id: "c", goal_type: "action" },
		];
		const sorted = sortByCanonicalOrder(sections, (s) => s.goal_type);
		expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
	});

	it("is stable within a shared slot (original relative order preserved)", () => {
		const sections: Array<{ id: string; goal_type: GoalType }> = [
			{ id: "x1", goal_type: "tech_stack" },
			{ id: "x2", goal_type: "tech_stack" },
			{ id: "ctx", goal_type: "context" },
		];
		const sorted = sortByCanonicalOrder(sections, (s) => s.goal_type);
		expect(sorted.map((s) => s.id)).toEqual(["ctx", "x1", "x2"]);
	});
});
