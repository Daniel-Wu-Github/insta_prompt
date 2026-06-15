/**
 * PromptCompiler motion system — a small NAMED set of curves + durations so no
 * state transition uses an ad-hoc duration (plan §2.2 S-MOT-1).  Pure data + a
 * tiny runtime; no DOM imports (portable into packages/core, plan R-ARCH-1).
 *
 * Every UI state flip (segment appears, accept, stale, bind streaming, commit)
 * picks one of these tokens.  `prefers-reduced-motion` degrades to opacity-only
 * or instant (S-MOT-2); callers MUST route timing through `transition()` /
 * `motionDurationMs()` so the reduced-motion fallback is honored everywhere.
 *
 * Plan ref: docs/agent_plans/v2/v2_uiux_megaplan.md §2.2 (Track B2).
 */

/** ≤5 named easing curves (plan caps the system at 5). */
export const easing = {
	/** state flips — crisp, no overshoot */
	snap: "cubic-bezier(0.2, 0, 0, 1)",
	/** popovers entering — gentle spring-like ease */
	float: "cubic-bezier(0.34, 1.56, 0.64, 1)",
	/** streaming/loading pulse — symmetric */
	pulse: "cubic-bezier(0.4, 0, 0.6, 1)",
	/** large/soft surfaces — long silky ease */
	silk: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;
export type EasingName = keyof typeof easing;

/** Duration tokens in ms. */
export const duration = {
	instant: 0,
	fast: 120, // state flips (snap)
	base: 200, // most transitions
	slow: 320, // popover float / panel
	pulse: 1200, // streaming loop
} as const;
export type DurationName = keyof typeof duration;

/** Default curve paired with each duration when a caller doesn't specify one. */
const defaultEasingFor: Record<DurationName, EasingName> = {
	instant: "snap",
	fast: "snap",
	base: "snap",
	slow: "float",
	pulse: "pulse",
};

/**
 * Detect reduced-motion. Guarded so this stays pure/portable: returns false in
 * any environment without `matchMedia` (Node/core unit tests, SSR).
 */
export function prefersReducedMotion(): boolean {
	const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
	if (typeof mm !== "function") return false;
	try {
		return mm("(prefers-reduced-motion: reduce)").matches;
	} catch {
		return false;
	}
}

/** Resolve a duration in ms, collapsing to 0 under reduced-motion. */
export function motionDurationMs(name: DurationName): number {
	if (prefersReducedMotion()) return 0;
	return duration[name];
}

/**
 * Build a CSS `transition` shorthand for one or more properties.  Under
 * reduced-motion, non-opacity properties are dropped and any opacity transition
 * collapses to instant — i.e. motion degrades to opacity-only/instant (S-MOT-2).
 *
 *   transition("opacity", "fast")            -> "opacity 120ms cubic-bezier(...)"
 *   transition(["transform","opacity"],"slow")
 */
export function transition(
	property: string | string[],
	durationName: DurationName = "base",
	easingName: EasingName = defaultEasingFor[durationName],
): string {
	const props = Array.isArray(property) ? property : [property];
	const reduced = prefersReducedMotion();
	const ms = reduced ? 0 : duration[durationName];
	const curve = easing[easingName];
	const usable = reduced ? props.filter((p) => p === "opacity" || p === "all") : props;
	if (usable.length === 0) return "none";
	return usable.map((p) => `${p} ${ms}ms ${curve}`).join(", ");
}
