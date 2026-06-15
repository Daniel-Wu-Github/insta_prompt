import { afterEach, describe, expect, it, vi } from "vitest";
import {
	GOAL_TYPES,
	clauseAccent,
	clauseEncoding,
	colorsByTheme,
	tokensToCssVars,
	sectionState,
	zIndex,
	duration,
	easing,
	transition,
	motionDurationMs,
	prefersReducedMotion,
} from "../../../../shared/design";

describe("design tokens (Track B1)", () => {
	it("locks all six clause accents to the canonical palette", () => {
		expect(clauseAccent).toEqual({
			context: "#d97706",
			tech_stack: "#0d9488",
			constraint: "#e11d48",
			action: "#7c3aed",
			output_format: "#2563eb",
			edge_case: "#6b7280",
		});
	});

	it("gives every clause type a redundant non-color encoding (S-VIS-3)", () => {
		for (const t of GOAL_TYPES) {
			expect(clauseEncoding[t].glyph.length).toBeGreaterThan(0);
			expect(clauseEncoding[t].underlineThickness).toBeGreaterThanOrEqual(2);
		}
		// glyphs must be distinct so the type is legible without color
		const glyphs = GOAL_TYPES.map((t) => clauseEncoding[t].glyph);
		expect(new Set(glyphs).size).toBe(GOAL_TYPES.length);
	});

	it("emits a non-empty --pc-* CSS var block for both themes", () => {
		for (const theme of ["light", "dark"] as const) {
			const css = tokensToCssVars(theme);
			expect(css).toContain("--pc-clause-tech-stack: #0d9488;");
			expect(css).toContain("--pc-text-primary:");
			expect(css).toContain("--pc-neutral-0:");
			expect(css.split("\n").length).toBeGreaterThan(20);
		}
	});

	it("provides 12-step neutral ramps for both themes", () => {
		expect(colorsByTheme.light.neutral).toHaveLength(12);
		expect(colorsByTheme.dark.neutral).toHaveLength(12);
	});

	it("uses the max 32-bit z-index ceiling and ordered state opacities", () => {
		expect(zIndex.overlayCeiling).toBe(2147483647);
		expect(sectionState.ready.opacity).toBeGreaterThan(sectionState.accepted.opacity);
		expect(sectionState.accepted.opacity).toBeGreaterThan(sectionState.acceptedStale.opacity);
		expect(sectionState.stale.colorRole).toBe("stale");
	});
});

describe("motion system (Track B2)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const stubReducedMotion = (matches: boolean): void => {
		vi.stubGlobal("matchMedia", (q: string) => ({
			matches: q.includes("reduce") ? matches : false,
		}));
	};

	it("caps the curve set at five named easings", () => {
		expect(Object.keys(easing).length).toBeLessThanOrEqual(5);
		expect(duration.fast).toBe(120);
	});

	it("builds normal transitions when motion is allowed", () => {
		stubReducedMotion(false);
		expect(prefersReducedMotion()).toBe(false);
		expect(transition("opacity", "fast")).toBe(`opacity 120ms ${easing.snap}`);
		expect(motionDurationMs("slow")).toBe(320);
	});

	it("degrades to opacity-only / instant under prefers-reduced-motion (S-MOT-2)", () => {
		stubReducedMotion(true);
		expect(prefersReducedMotion()).toBe(true);
		// non-opacity props are dropped
		expect(transition("transform", "slow")).toBe("none");
		// opacity survives but collapses to 0ms
		expect(transition("opacity", "slow")).toBe(`opacity 0ms ${easing.float}`);
		expect(motionDurationMs("slow")).toBe(0);
	});

	it("treats a missing matchMedia (Node/core) as motion-allowed", () => {
		// no stub -> jsdom may or may not define matchMedia; force absence
		vi.stubGlobal("matchMedia", undefined);
		expect(prefersReducedMotion()).toBe(false);
	});
});
