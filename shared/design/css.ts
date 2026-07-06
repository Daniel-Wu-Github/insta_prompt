/**
 * Shared shadow-root stylesheet — the design system APPLIED (Track D).
 * Every injected shadow surface (popover, ghost panel, toast, future overlays)
 * prepends `shadowBaseCss(theme)` so they all share one token set, one motion
 * vocabulary, and one reduced-motion policy. Pure string builder, no DOM imports.
 *
 * Note: CSS `all: initial` (used by each surface's :host reset) does NOT reset
 * custom properties per spec, so injecting `:host { --pc-* }` here is safe
 * alongside an existing `:host { all: initial; … }` block.
 */
import { tokensToCssVars, type Theme } from "./tokens";
import { duration, easing } from "./motion";

/**
 * Token custom properties + the named motion keyframes + the global
 * reduced-motion guard, ready to prepend to any shadow root's <style>.
 *
 * `options.fontUrl` — extension-resolved URL of the bundled Inter Variable
 * woff2 (Track D). Passed in by the caller because this module is a pure
 * string builder with no chrome.* access; when absent (tests, non-extension
 * surfaces) the `--pc-font-family` stack falls through to system-ui exactly
 * as before.
 */
export function shadowBaseCss(theme: Theme = "dark", options?: { fontUrl?: string }): string {
	const vars = tokensToCssVars(theme)
		.split("\n")
		.map((line) => `\t${line}`)
		.join("\n");
	const fontFace = options?.fontUrl
		? `@font-face {
	font-family: "Inter Variable";
	font-style: normal;
	font-weight: 100 900;
	font-display: swap;
	src: url("${options.fontUrl}") format("woff2-variations");
}
`
		: "";
	return `
${fontFace}:host {
${vars}
}
@keyframes pc-float-in {
	from { opacity: 0; transform: translateY(4px) scale(0.985); }
	to { opacity: 1; transform: none; }
}
@keyframes pc-pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.55; }
}
/* S-MOT-2: honor the OS reduced-motion preference on every surface. */
@media (prefers-reduced-motion: reduce) {
	*, ::before, ::after {
		animation-duration: 0.001ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.001ms !important;
	}
}
`;
}

/** Ready-to-use `animation` shorthands keyed to the motion tokens. */
export const motionPreset = {
	/** popover / panel entrance */
	floatIn: `pc-float-in ${duration.slow}ms ${easing.float} both`,
	/** streaming / loading affordance */
	pulse: `pc-pulse ${duration.pulse}ms ${easing.pulse} infinite`,
} as const;
