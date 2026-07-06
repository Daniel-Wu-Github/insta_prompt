// G-1 (axe gate): zero critical/serious violations while every extension
// surface is up. The extension's overlays are aria-hidden pointer-inert
// mirrors, so the assertable claim is "the extension does not degrade the
// host page's accessibility tree" — checked on the accessible baseline
// fixture with overlay + HUD + coach mark + ghost panel all visible.
import { test, expect } from "../fixtures/extension";
import { SAMPLE_PROMPT, typeAndAwaitUnderlines } from "../lib/helpers";
import { criticalA11yViolations } from "../lib/axe";

test("G-1 plain-textarea: no critical/serious axe violations with all surfaces visible", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/plain-textarea.html");

	expect(await typeAndAwaitUnderlines(page, "#composer", SAMPLE_PROMPT)).toBe(true);

	// Bring up the ghost panel (review mode) and keep HUD + coach mark on screen.
	await page.keyboard.press("Tab");
	await page.waitForTimeout(200);

	const violations = await criticalA11yViolations(page);
	expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

	await page.close();
});

test("G-1 chatgpt fixture: extension surfaces stay out of the a11y tree", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/chatgpt.html");

	expect(await typeAndAwaitUnderlines(page, "#prompt-textarea", SAMPLE_PROMPT)).toBe(true);

	// Every extension host must be aria-hidden (mirrors are visual-only; the
	// content they mirror stays fully accessible in the host input).
	const unhiddenSurfaces = await page.evaluate(() => {
		return Array.from(
			document.querySelectorAll(
				"[data-insta-draft-overlay], [data-insta-draft-hover-popover], [data-insta-ghost-panel], [data-insta-keymap-hud], [data-insta-coach-mark]",
			),
		)
			.filter((node) => node.getAttribute("aria-hidden") !== "true")
			.map((node) => node.tagName);
	});
	expect(unhiddenSurfaces).toEqual([]);

	const violations = await criticalA11yViolations(page);
	expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

	await page.close();
});
