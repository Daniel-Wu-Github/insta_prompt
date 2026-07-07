import type { Mode } from "../../../shared/contracts";

// Quality bar (BE-QUAL-1): an enhanced fragment must SHARPEN the user's clause,
// not pad it. The historic failure mode was boilerplate inflation — "use react
// and typescript" ballooning into invented requirements about "latest stable
// versions" under generic headers — which the bind pass then stitched verbatim.
export const ENHANCE_MODE_INSTRUCTIONS: Record<Mode, readonly string[]> = {
	efficiency: [
		"Rewrite the clause as one or two precise imperative sentences.",
		"Cut filler; keep only what the user actually asked for.",
	],
	balanced: [
		"Rewrite the clause as one tight paragraph of imperative instructions (2-4 sentences).",
		"Sharpen vague wording into concrete, checkable instructions.",
		"Do not use markdown headers; fragments are merged later and headers survive as seams.",
	],
	detailed: [
		"Rewrite the clause as a specific, comprehensive instruction block.",
		"Make success criteria explicit where the clause implies them.",
		"Short bullet lists are allowed; markdown headers are not.",
	],
};

// Quality bar (BE-QUAL-1): the bind pass must COMPILE, not concatenate. The
// historic failure mode was one heading per slot with each expansion pasted
// nearly verbatim in third-person narrative ("The context involves...") — a
// stitched document, not a prompt anyone would actually send to an assistant.
export const BIND_MODE_INSTRUCTIONS: Record<Mode, readonly string[]> = {
	efficiency: [
		"Keep the final prompt short and direct.",
		"Preserve only high-value details and non-negotiable constraints.",
	],
	balanced: [
		"Return one flowing prompt in a few short paragraphs; use at most one or two markdown headers, and only where they genuinely aid scanning.",
		"Preserve important detail while eliminating repetition across sections.",
	],
	detailed: [
		"Return a structured final prompt; group related sections under shared headers rather than one header per input section.",
		"Retain nuanced constraints, dependencies, and edge-case guidance.",
	],
};

export function renderInstructionBlock(lines: readonly string[]): string {
	return lines.map((line) => `- ${line}`).join("\n");
}