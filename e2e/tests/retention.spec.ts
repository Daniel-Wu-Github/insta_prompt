// A3/G-3 (zero-retention) — DOM-count proxy tier: after clearing the draft or
// tearing the editor out of the DOM, no extension node may remain attached.
// (Full heap-snapshot diffing via CDP HeapProfiler is the escalation path if
// this proxy ever proves insufficient; the manual guide keeps that drill.)
import { test, expect } from "../fixtures/extension";
import { SAMPLE_PROMPT, typeAndAwaitUnderlines } from "../lib/helpers";

async function extensionNodeCount(page: import("@playwright/test").Page): Promise<number> {
	return page.evaluate(() => {
		return document.querySelectorAll(
			"[data-insta-draft-overlay], [data-insta-draft-hover-popover], [data-insta-ghost-panel], [data-insta-keymap-hud], [data-insta-coach-mark]",
		).length;
	});
}

test("A3 plain-textarea: clearing the input removes every extension surface", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/plain-textarea.html");

	expect(await typeAndAwaitUnderlines(page, "#composer", SAMPLE_PROMPT)).toBe(true);
	expect(await extensionNodeCount(page)).toBeGreaterThanOrEqual(1);

	// Select-all + delete, then wait out the debounce that clears the draft.
	await page.click("#composer");
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.press("Delete");
	await page.waitForTimeout(700);

	expect(await extensionNodeCount(page)).toBe(0);

	await page.close();
});

test("A3 linear: SPA teardown leaves no orphaned overlay pointing at a detached editor", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/linear.html");

	expect(await typeAndAwaitUnderlines(page, ".editor-root", SAMPLE_PROMPT)).toBe(true);

	await page.evaluate(() => (window as Window & { __spaNavigate?: () => void }).__spaNavigate?.());
	// The overlay sync path clears the rendering when it notices the source
	// element is disconnected (scroll/resize tick) — nudge it.
	await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
	await page.waitForTimeout(400);

	const orphaned = await page.evaluate(() => {
		const overlay = document.querySelector('[data-insta-draft-overlay="true"]');
		return overlay !== null;
	});
	expect(orphaned).toBe(false);

	await page.close();
});
