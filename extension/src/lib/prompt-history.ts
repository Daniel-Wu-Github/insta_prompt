import { MODE_VALUES, type Mode } from "../../../shared/contracts";

// Prompt history + template library. One storage key in chrome.storage.local,
// shared by the content script (writes on commit) and the popup (browse /
// search / pin / delete). Read-modify-write is not transactional, but each
// surface writes rarely (a commit, a pin click) so last-write-wins is fine.
export const PROMPT_HISTORY_STORAGE_KEY = "promptcompiler.history";
// Unpinned entries roll off oldest-first past this cap; pinned templates are
// never evicted by saves, only by an explicit unpin/delete in the popup.
export const PROMPT_HISTORY_UNPINNED_LIMIT = 50;
export const PROMPT_HISTORY_PINNED_LIMIT = 20;

export interface PromptHistoryEntry {
	id: string;
	prompt: string;
	host: string;
	mode: Mode;
	createdAt: number;
	pinned: boolean;
}

export function isPromptHistoryEntry(value: unknown): value is PromptHistoryEntry {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		record.id.length > 0 &&
		typeof record.prompt === "string" &&
		record.prompt.length > 0 &&
		typeof record.host === "string" &&
		typeof record.mode === "string" &&
		(MODE_VALUES as readonly string[]).includes(record.mode) &&
		typeof record.createdAt === "number" &&
		typeof record.pinned === "boolean"
	);
}

function generateEntryId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `hist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readRawHistory(): Promise<PromptHistoryEntry[]> {
	const result = await chrome.storage.local.get(PROMPT_HISTORY_STORAGE_KEY);
	const stored = (result as Record<string, unknown>)[PROMPT_HISTORY_STORAGE_KEY];
	if (!Array.isArray(stored)) {
		return [];
	}
	// Malformed entries (older schema, manual edits) are dropped, not fatal.
	return stored.filter(isPromptHistoryEntry);
}

async function writeHistory(entries: readonly PromptHistoryEntry[]): Promise<void> {
	await chrome.storage.local.set({ [PROMPT_HISTORY_STORAGE_KEY]: entries });
}

export async function readPromptHistory(): Promise<PromptHistoryEntry[]> {
	return readRawHistory();
}

export async function savePromptToHistory(input: { prompt: string; host: string; mode: Mode }): Promise<void> {
	const prompt = input.prompt.trim();
	if (prompt.length === 0) {
		return;
	}

	const entries = await readRawHistory();

	// Re-committing an identical prompt bumps the existing entry to the front
	// (keeping its id and pinned flag) instead of duplicating it.
	const existingIndex = entries.findIndex((entry) => entry.prompt === prompt);
	const entry: PromptHistoryEntry =
		existingIndex === -1
			? { id: generateEntryId(), prompt, host: input.host, mode: input.mode, createdAt: Date.now(), pinned: false }
			: { ...entries[existingIndex]!, host: input.host, mode: input.mode, createdAt: Date.now() };
	if (existingIndex !== -1) {
		entries.splice(existingIndex, 1);
	}
	entries.unshift(entry);

	// Enforce the unpinned cap while preserving list order.
	const keptUnpinned = new Set(entries.filter((candidate) => !candidate.pinned).slice(0, PROMPT_HISTORY_UNPINNED_LIMIT));
	await writeHistory(entries.filter((candidate) => candidate.pinned || keptUnpinned.has(candidate)));
}

export type SetPinnedResult = { ok: true } | { ok: false; reason: "not-found" | "pin-limit" };

export async function setPromptPinned(id: string, pinned: boolean): Promise<SetPinnedResult> {
	const entries = await readRawHistory();
	const entry = entries.find((candidate) => candidate.id === id);
	if (!entry) {
		return { ok: false, reason: "not-found" };
	}
	if (pinned && !entry.pinned) {
		const pinnedCount = entries.filter((candidate) => candidate.pinned).length;
		if (pinnedCount >= PROMPT_HISTORY_PINNED_LIMIT) {
			return { ok: false, reason: "pin-limit" };
		}
	}
	entry.pinned = pinned;
	await writeHistory(entries);
	return { ok: true };
}

export async function deletePromptHistoryEntry(id: string): Promise<void> {
	const entries = await readRawHistory();
	await writeHistory(entries.filter((candidate) => candidate.id !== id));
}
