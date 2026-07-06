// G-5 (keyboard-only operability): the entire review→accept→bind flow driven
// exclusively through page.keyboard — no mouse APIs in this spec, by
// construction. The bind call itself has no backend in this tier, so the gate
// asserts the keyboard-triggered ghost panel feedback, not stream completion.
import { test, expect } from "../fixtures/extension";
import { SAMPLE_PROMPT, typeAndAwaitUnderlines } from "../lib/helpers";

type SpanState = { segmentIndex: string; accepted: string; focused: string };

function readSpanStates(page: import("@playwright/test").Page): Promise<SpanState[]> {
	return page.evaluate(() => {
		const overlay = document.querySelector('[data-insta-draft-overlay="true"]');
		return Array.from(overlay?.shadowRoot?.querySelectorAll<HTMLSpanElement>("span[data-segment-index]") ?? []).map(
			(span) => ({
				segmentIndex: span.dataset.segmentIndex ?? "?",
				accepted: span.dataset.accepted ?? "false",
				focused: span.dataset.focused ?? "false",
			}),
		);
	});
}

test("G-5 plain-textarea: Tab→Enter→⌘Enter flow is fully keyboard-operable", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/plain-textarea.html");

	// typeAndAwaitUnderlines clicks once to focus; everything after is keys only.
	expect(await typeAndAwaitUnderlines(page, "#composer", SAMPLE_PROMPT)).toBe(true);

	// Tab enters review mode and focuses clause 0 (no acceptance yet).
	await page.keyboard.press("Tab");
	let states = await readSpanStates(page);
	expect(states.find((s) => s.focused === "true")?.segmentIndex).toBe("0");
	expect(states.every((s) => s.accepted === "false")).toBe(true);

	// The review-hint ghost panel appeared on entering review mode.
	const ghostPanelVisible = await page.evaluate(() => document.querySelector('[data-insta-ghost-panel="true"]') !== null);
	expect(ghostPanelVisible).toBe(true);

	// Enter accepts clause 0; focus auto-advances; second Enter accepts clause 1.
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	states = await readSpanStates(page);
	expect(states.filter((s) => s.accepted === "true").map((s) => s.segmentIndex)).toEqual(["0", "1"]);

	// Shift+Tab cycles focus backwards without un-accepting.
	await page.keyboard.press("Shift+Tab");
	states = await readSpanStates(page);
	expect(states.filter((s) => s.accepted === "true")).toHaveLength(2);

	// Ctrl+Enter triggers bind: with accepted clauses the gate is open, so the
	// ghost panel must show compile feedback (stream will fail later — no
	// backend in this tier — which is out of scope for the keyboard gate).
	await page.keyboard.press("ControlOrMeta+Enter");
	await page.waitForTimeout(300);
	const ghostStatus = await page.evaluate(() => {
		const panel = document.querySelector('[data-insta-ghost-panel="true"]');
		return panel?.shadowRoot?.textContent ?? "";
	});
	expect(ghostStatus.length).toBeGreaterThan(0);

	// Esc is layered: the first press cancels the in-flight bind stream, the
	// second leaves review mode (no clause focused afterwards).
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");
	states = await readSpanStates(page);
	expect(states.every((s) => s.focused === "false")).toBe(true);

	await page.close();
});
