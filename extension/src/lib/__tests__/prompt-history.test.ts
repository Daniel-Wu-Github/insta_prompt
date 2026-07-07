import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	PROMPT_HISTORY_PINNED_LIMIT,
	PROMPT_HISTORY_STORAGE_KEY,
	PROMPT_HISTORY_UNPINNED_LIMIT,
	deletePromptHistoryEntry,
	readPromptHistory,
	savePromptToHistory,
	setPromptPinned,
	type PromptHistoryEntry,
} from "../prompt-history";

// In-memory chrome.storage.local backing the module under test — the real
// read-modify-write path runs unchanged against it.
function installChromeStorage(initialHistory?: unknown): Record<string, unknown> {
	const store: Record<string, unknown> = {};
	if (initialHistory !== undefined) {
		store[PROMPT_HISTORY_STORAGE_KEY] = initialHistory;
	}
	vi.stubGlobal("chrome", {
		storage: {
			local: {
				get: async (key: string) => ({ [key]: store[key] }),
				set: async (items: Record<string, unknown>) => {
					Object.assign(store, items);
				},
			},
		},
	});
	return store;
}

function storedHistory(store: Record<string, unknown>): PromptHistoryEntry[] {
	return (store[PROMPT_HISTORY_STORAGE_KEY] as PromptHistoryEntry[] | undefined) ?? [];
}

function makeEntry(overrides: Partial<PromptHistoryEntry>): PromptHistoryEntry {
	return {
		id: `id-${Math.random().toString(36).slice(2)}`,
		prompt: "a compiled prompt",
		host: "chat.example.com",
		mode: "balanced",
		createdAt: Date.now(),
		pinned: false,
		...overrides,
	};
}

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("prompt history storage", () => {
	it("saves a new entry to the front, unpinned", async () => {
		const store = installChromeStorage([makeEntry({ id: "old", prompt: "earlier prompt" })]);

		await savePromptToHistory({ prompt: "  Build a dashboard.  ", host: "chatgpt.com", mode: "detailed" });

		const entries = storedHistory(store);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			prompt: "Build a dashboard.",
			host: "chatgpt.com",
			mode: "detailed",
			pinned: false,
		});
		expect(entries[1]?.id).toBe("old");
	});

	it("ignores empty prompts", async () => {
		const store = installChromeStorage();
		await savePromptToHistory({ prompt: "   ", host: "chatgpt.com", mode: "balanced" });
		expect(store[PROMPT_HISTORY_STORAGE_KEY]).toBeUndefined();
	});

	it("re-saving an identical prompt bumps it to the front, keeping id and pinned flag", async () => {
		const store = installChromeStorage([
			makeEntry({ id: "newer", prompt: "newer prompt" }),
			makeEntry({ id: "dup", prompt: "Build a dashboard.", pinned: true, createdAt: 1000 }),
		]);

		await savePromptToHistory({ prompt: "Build a dashboard.", host: "claude.ai", mode: "efficiency" });

		const entries = storedHistory(store);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ id: "dup", pinned: true, host: "claude.ai", mode: "efficiency" });
		expect(entries[0]!.createdAt).toBeGreaterThan(1000);
	});

	it("evicts the oldest unpinned entries past the cap but never evicts pinned templates", async () => {
		const seeded = Array.from({ length: PROMPT_HISTORY_UNPINNED_LIMIT }, (_, index) =>
			makeEntry({ id: `u${index}`, prompt: `unpinned ${index}` }),
		);
		// Oldest slot in the list is a pinned template — it must survive.
		seeded.push(makeEntry({ id: "pinned-old", prompt: "pinned template", pinned: true }));
		const store = installChromeStorage(seeded);

		await savePromptToHistory({ prompt: "the newest prompt", host: "chatgpt.com", mode: "balanced" });

		const entries = storedHistory(store);
		expect(entries.filter((entry) => !entry.pinned)).toHaveLength(PROMPT_HISTORY_UNPINNED_LIMIT);
		expect(entries[0]?.prompt).toBe("the newest prompt");
		expect(entries.some((entry) => entry.id === "pinned-old")).toBe(true);
		// The oldest unpinned entry rolled off.
		expect(entries.some((entry) => entry.id === `u${PROMPT_HISTORY_UNPINNED_LIMIT - 1}`)).toBe(false);
	});

	it("pins and unpins entries, enforcing the template limit", async () => {
		const pinnedSeed = Array.from({ length: PROMPT_HISTORY_PINNED_LIMIT }, (_, index) =>
			makeEntry({ id: `p${index}`, prompt: `pinned ${index}`, pinned: true }),
		);
		const store = installChromeStorage([...pinnedSeed, makeEntry({ id: "candidate", prompt: "wants pinning" })]);

		expect(await setPromptPinned("candidate", true)).toEqual({ ok: false, reason: "pin-limit" });
		expect(await setPromptPinned("missing", true)).toEqual({ ok: false, reason: "not-found" });

		expect(await setPromptPinned("p0", false)).toEqual({ ok: true });
		expect(await setPromptPinned("candidate", true)).toEqual({ ok: true });

		const entries = storedHistory(store);
		expect(entries.find((entry) => entry.id === "candidate")?.pinned).toBe(true);
		expect(entries.find((entry) => entry.id === "p0")?.pinned).toBe(false);
	});

	it("deletes entries by id", async () => {
		const store = installChromeStorage([makeEntry({ id: "keep" }), makeEntry({ id: "drop", prompt: "other" })]);
		await deletePromptHistoryEntry("drop");
		expect(storedHistory(store).map((entry) => entry.id)).toEqual(["keep"]);
	});

	it("read filters malformed entries instead of failing", async () => {
		installChromeStorage([
			makeEntry({ id: "valid" }),
			{ id: "broken", prompt: 42 },
			"not-an-object",
			makeEntry({ id: "bad-mode", mode: "turbo" as never }),
		]);

		const entries = await readPromptHistory();
		expect(entries.map((entry) => entry.id)).toEqual(["valid"]);
	});
});
