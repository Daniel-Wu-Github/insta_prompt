/**
 * PromptCompiler design tokens — the single source of truth for every visual
 * constant across every surface (extension overlay, popup, future web/IDE
 * adapters).  Pure data + a tiny runtime; ZERO DOM/Node/browser imports so this
 * module is portable into `packages/core` during Track C (plan R-ARCH-1).
 *
 * Rules baked in (plan §2.1, ui-design-system skill):
 *  - No `rem` anywhere — injected/shadow surfaces inherit the host <html>
 *    font-size, which varies per site.  All sizes are `px` numbers.
 *  - The six clause accents are LOCKED (do not invent new clause colors).
 *  - Light + dark parity: every themeable token has both.
 *
 * Plan ref: docs/agent_plans/v2/v2_uiux_megaplan.md §4.1 (Track B1).
 */

export type Theme = "light" | "dark";

export const GOAL_TYPES = [
	"context",
	"tech_stack",
	"constraint",
	"action",
	"output_format",
	"edge_case",
] as const;
export type ClauseType = (typeof GOAL_TYPES)[number];

/**
 * LOCKED clause accents (ui-design-system skill §"Goal Type → Color Mapping").
 * These are the canonical values; code that drifted from them is reconciled to
 * these in Track B3.  One value per type (legible on both themes); redundant
 * non-color encoding (glyph/texture, B4) carries the signal for color-blind
 * users so these are never the sole channel (plan S-VIS-3).
 */
export const clauseAccent: Record<ClauseType, string> = {
	context: "#d97706", // amber
	tech_stack: "#0d9488", // teal
	constraint: "#e11d48", // coral / rose
	action: "#7c3aed", // purple
	output_format: "#2563eb", // blue
	edge_case: "#6b7280", // gray
};

/**
 * Redundant non-color encoding per clause type (plan S-VIS-3, Track B4).
 * `glyph` leads the popover header; `underlineStyle`/`underlineThickness` give
 * each type a distinct underline texture so the system is legible without color.
 */
export const clauseEncoding: Record<
	ClauseType,
	{ glyph: string; label: string; underlineStyle: "solid" | "double" | "dotted" | "dashed" | "wavy"; underlineThickness: number }
> = {
	context: { glyph: "◆", label: "Context", underlineStyle: "solid", underlineThickness: 2 },
	tech_stack: { glyph: "⬡", label: "Tech stack", underlineStyle: "double", underlineThickness: 2 },
	constraint: { glyph: "⊘", label: "Constraint", underlineStyle: "wavy", underlineThickness: 2 },
	action: { glyph: "▶", label: "Action", underlineStyle: "solid", underlineThickness: 3 },
	output_format: { glyph: "▤", label: "Output format", underlineStyle: "dotted", underlineThickness: 2 },
	edge_case: { glyph: "◈", label: "Edge case", underlineStyle: "dashed", underlineThickness: 2 },
};

/**
 * Convert a `#rrggbb` hex to a space-separated `rgb()` string (modern CSS color
 * syntax, matching the codebase's existing `rgb(r g b / a)` form).  Lets render
 * paths derive colors from the hex tokens above instead of hardcoding rgb strings.
 */
export function rgba(hex: string, alpha = 1): string {
	const h = hex.replace("#", "");
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** Single brand accent for primary actions (plan S-VIS-2). Matches output_format blue. */
export const brand = {
	accent: "#2563eb",
	accentHover: "#1d4ed8",
	onAccent: "#ffffff",
} as const;

/** 12-step neutral ramp per theme (0 = page bg … 12 = highest-contrast text). */
const neutralLight = [
	"#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8",
	"#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617",
] as const;
const neutralDark = [
	"#020617", "#0f172a", "#1e293b", "#334155", "#475569", "#64748b",
	"#94a3b8", "#cbd5e1", "#e2e8f0", "#f1f5f9", "#f8fafc", "#ffffff",
] as const;

/** Semantic, surface, and state colors per theme. */
interface ThemeColors {
	neutral: readonly string[];
	textPrimary: string;
	textSecondary: string;
	textMuted: string;
	surface: string; // panel/popover background
	surfaceBorder: string;
	overlayScrim: string; // dimming behind modals
	success: string;
	warning: string;
	error: string;
	info: string;
	/** Stale / degraded section color (plan: replaces removed confidence dashing). */
	stale: string;
}

export const colorsByTheme: Record<Theme, ThemeColors> = {
	light: {
		neutral: neutralLight,
		textPrimary: "#0f172a",
		textSecondary: "#475569",
		textMuted: "#94a3b8",
		surface: "#ffffff",
		surfaceBorder: "rgba(15, 23, 42, 0.12)",
		overlayScrim: "rgba(15, 23, 42, 0.32)",
		success: "#16a34a",
		warning: "#d97706",
		error: "#dc2626",
		info: "#2563eb",
		stale: "#9ca3af",
	},
	dark: {
		neutral: neutralDark,
		textPrimary: "#f8fafc",
		textSecondary: "#cbd5e1",
		textMuted: "#94a3b8",
		surface: "#0f172a",
		surfaceBorder: "rgba(148, 163, 184, 0.24)",
		overlayScrim: "rgba(2, 6, 23, 0.55)",
		success: "#4ade80",
		warning: "#fbbf24",
		error: "#f87171",
		info: "#60a5fa",
		stale: "#9ca3af",
	},
};

/** Typography — one variable family, fixed px scale, no rem (plan S-VIS-1). */
export const typography = {
	fontFamily:
		'"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
	fontFamilyMono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
	size: { xs: 12, sm: 13, base: 14, md: 16, lg: 20, xl: 24 },
	weight: { regular: 400, medium: 500, semibold: 600 },
	lineHeight: { tight: 1.25, body: 1.5 },
	tracking: { heading: "-0.01em", normal: "0", wide: "0.02em" },
} as const;

/** 4px spacing grid (plan S-VIS-4). Values are px numbers. */
export const space = {
	0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64,
} as const;

/** Radii (plan S-VIS-4). */
export const radius = { sm: 4, md: 8, lg: 10, xl: 12, pill: 9999 } as const;

/** One elevation/shadow scale for popovers and panels (plan S-VIS-4). */
export const elevation = {
	none: "none",
	popover: "0 12px 32px rgba(15, 23, 42, 0.32)",
	panel: "0 16px 40px rgba(15, 23, 42, 0.24)",
} as const;

export const border = { thin: 1, thick: 2 } as const;

/**
 * Z-index: the single overlay ceiling.  Use the max safe 32-bit int — some host
 * pages overflow arbitrary large numbers (plan §4.1, BUG-ZINDEX).  Modal
 * suppression (hide overlays while a host modal is open) is the paired behavior.
 */
export const zIndex = { overlayCeiling: 2147483647 } as const;

/**
 * Section lifecycle visual states (plan §4.2; replaces removed confidence styling).
 * `opacity` is applied to the draft overlay; `colorRole` picks accent vs stale.
 */
export const sectionState = {
	ready: { opacity: 1, colorRole: "accent" as const },
	focused: { opacity: 1, colorRole: "accent" as const },
	accepted: { opacity: 0.4, colorRole: "accent" as const },
	stale: { opacity: 0.45, colorRole: "stale" as const },
	acceptedStale: { opacity: 0.3, colorRole: "stale" as const },
} as const;
export type SectionStateName = keyof typeof sectionState;

/**
 * Emit the themeable tokens as a CSS custom-property block (without the wrapping
 * selector) for injection into a shadow root or <style>.  Names are `--pc-*`.
 * Adapters call this once per theme; the values above remain the JS source of truth.
 */
export function tokensToCssVars(theme: Theme): string {
	const c = colorsByTheme[theme];
	const lines: string[] = [];
	const push = (name: string, value: string | number): void => {
		lines.push(`--pc-${name}: ${typeof value === "number" ? `${value}px` : value};`);
	};

	for (const t of GOAL_TYPES) push(`clause-${t.replace(/_/g, "-")}`, clauseAccent[t]);
	push("brand-accent", brand.accent);
	push("brand-accent-hover", brand.accentHover);
	push("on-accent", brand.onAccent);
	c.neutral.forEach((hex, i) => push(`neutral-${i}`, hex));
	push("text-primary", c.textPrimary);
	push("text-secondary", c.textSecondary);
	push("text-muted", c.textMuted);
	push("surface", c.surface);
	push("surface-border", c.surfaceBorder);
	push("overlay-scrim", c.overlayScrim);
	push("color-success", c.success);
	push("color-warning", c.warning);
	push("color-error", c.error);
	push("color-info", c.info);
	push("color-stale", c.stale);
	push("radius-sm", radius.sm);
	push("radius-md", radius.md);
	push("radius-lg", radius.lg);
	push("shadow-popover", elevation.popover);
	push("shadow-panel", elevation.panel);
	push("font-family", typography.fontFamily);

	return lines.join("\n");
}
