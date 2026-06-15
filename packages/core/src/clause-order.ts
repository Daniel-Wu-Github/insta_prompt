/**
 * Canonical clause ordering — the single, global slot map for all surfaces.
 * Extracted from extension/src/content/index.ts (Track C1) so the extension,
 * backend, and future adapters share ONE definition (canonical-clause-ordering
 * skill invariant: "UI and backend references use the same slot definition
 * source"). Pure TS, no DOM/Node/chrome imports (plan R-ARCH-1).
 */
import { GOAL_TYPE_VALUES, type GoalType } from "../../../shared/contracts";

/** Immutable canonical slot per goal_type. 1-indexed; matches backend schema. */
export const CANONICAL_ORDER_BY_GOAL_TYPE: Record<GoalType, number> = {
	context: 1,
	tech_stack: 2,
	constraint: 3,
	action: 4,
	output_format: 5,
	edge_case: 6,
};

/** Goal types in canonical bind order (context … edge_case). */
export const GOAL_TYPES_IN_CANONICAL_ORDER: GoalType[] = [...GOAL_TYPE_VALUES].sort(
	(left, right) => CANONICAL_ORDER_BY_GOAL_TYPE[left] - CANONICAL_ORDER_BY_GOAL_TYPE[right],
);

export const canonicalSlotForGoalType = (goalType: GoalType): number =>
	CANONICAL_ORDER_BY_GOAL_TYPE[goalType];

/**
 * Stable sort of arbitrary items by their goal_type's canonical slot. Items in the
 * same slot keep their original relative order (deterministic bind assembly).
 */
export function sortByCanonicalOrder<T>(items: readonly T[], goalTypeOf: (item: T) => GoalType): T[] {
	return items
		.map((item, index) => ({ item, index }))
		.sort((a, b) => {
			const delta =
				CANONICAL_ORDER_BY_GOAL_TYPE[goalTypeOf(a.item)] - CANONICAL_ORDER_BY_GOAL_TYPE[goalTypeOf(b.item)];
			return delta !== 0 ? delta : a.index - b.index;
		})
		.map((entry) => entry.item);
}
