import type { PromptSibling } from "./types";

export const SIBLING_CONTEXT_LIMITS = {
	MAX_SIBLINGS: 5,
	MAX_TEXT_CHARS_PER_SIBLING: 180,
	MAX_TOTAL_SERIALIZED_CHARS: 700,
} as const;

const WHITESPACE_RE = /\s+/g;
const TRUNCATION_SUFFIX = "...";

function normalizeText(text: string): string {
	return text.replace(WHITESPACE_RE, " ").trim();
}

function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}

	if (maxChars <= TRUNCATION_SUFFIX.length) {
		return TRUNCATION_SUFFIX.slice(0, maxChars);
	}

	return `${text.slice(0, maxChars - TRUNCATION_SUFFIX.length).trimEnd()}${TRUNCATION_SUFFIX}`;
}

function formatSiblingLine(sibling: PromptSibling): string {
	const normalized = normalizeText(sibling.text);
	const bounded = truncateText(normalized, SIBLING_CONTEXT_LIMITS.MAX_TEXT_CHARS_PER_SIBLING);
	return `- [${sibling.goal_type}] ${bounded}`;
}

export function serializeSiblingContext(siblings: readonly PromptSibling[] | null | undefined): string {
	if (!siblings || siblings.length === 0) {
		return "";
	}

	const lines: string[] = [];
	let serializedChars = 0;

	for (const sibling of siblings.slice(0, SIBLING_CONTEXT_LIMITS.MAX_SIBLINGS)) {
		if (normalizeText(sibling.text).length === 0) {
			continue;
		}

		const line = formatSiblingLine(sibling);
		if (serializedChars + line.length > SIBLING_CONTEXT_LIMITS.MAX_TOTAL_SERIALIZED_CHARS) {
			break;
		}

		lines.push(line);
		serializedChars += line.length;
	}

	if (lines.length === 0) {
		return "";
	}

	return ["", "Sibling context (for coherence only; do not copy verbatim):", ...lines].join("\n");
}