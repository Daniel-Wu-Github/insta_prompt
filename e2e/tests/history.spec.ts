// Prompt history + template library: a committed compiled prompt must land in
// chrome.storage.local under promptcompiler.history, where the popup's
// History & Templates panel reads it. Drives the full accept→bind→commit
// cycle against the mock backend's /bind SSE stream.
import { test, expect } from "../fixtures/extension";
import { SAMPLE_PROMPT, typeAndAwaitUnderlines } from "../lib/helpers";

type HistoryEntry = { prompt: string; host: string; mode: string; pinned: boolean; id: string; createdAt: number };

test("history: committing a compiled prompt persists one entry for the popup library", async ({ context, serviceWorker }) => {
	const page = await context.newPage();
	await page.goto("/sites/plain-textarea.html");

	expect(await typeAndAwaitUnderlines(page, "#composer", SAMPLE_PROMPT)).toBe(true);

	// Keyboard-only: review, accept all three clauses, bind.
	await page.keyboard.press("Tab");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	await page.keyboard.press("ControlOrMeta+Enter");

	// The mock backend streams the bound prompt; the ghost panel flips to
	// commit-ready when the stream completes.
	await page.waitForFunction(() => {
		const panel = document.querySelector('[data-insta-ghost-panel="true"]');
		return (panel?.shadowRoot?.textContent ?? "").includes("Press Enter to commit");
	}, undefined, { timeout: 10_000 });

	await page.keyboard.press("Enter");

	// The compiled prompt replaced the draft in the host input.
	const committed = await page.inputValue("#composer");
	expect(committed.length).toBeGreaterThan(0);
	expect(committed).not.toBe(SAMPLE_PROMPT);

	// The history write is fire-and-forget after commit — poll storage from the
	// service worker context until it lands.
	await expect
		.poll(
			async () => {
				const entries = await serviceWorker.evaluate(async () => {
					const result = await chrome.storage.local.get("promptcompiler.history");
					return (result["promptcompiler.history"] ?? []) as unknown[];
				});
				return entries as HistoryEntry[];
			},
			{ timeout: 5_000 },
		)
		.toHaveLength(1);

	const entries = (await serviceWorker.evaluate(async () => {
		const result = await chrome.storage.local.get("promptcompiler.history");
		return (result["promptcompiler.history"] ?? []) as unknown[];
	})) as HistoryEntry[];

	expect(entries[0]?.prompt).toBe(committed.trim());
	expect(entries[0]?.host).toBe("127.0.0.1:4173");
	expect(entries[0]?.pinned).toBe(false);
	expect(typeof entries[0]?.id).toBe("string");
	expect(typeof entries[0]?.createdAt).toBe("number");

	await page.close();
});
