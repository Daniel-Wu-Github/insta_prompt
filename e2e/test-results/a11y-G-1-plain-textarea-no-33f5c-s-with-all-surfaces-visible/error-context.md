# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a11y.spec.ts >> G-1 plain-textarea: no critical/serious axe violations with all surfaces visible
- Location: tests/a11y.spec.ts:10:1

# Error details

```
Error: [
  {
    "id": "color-contrast",
    "impact": "serious",
    "nodes": 1
  }
]

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 7

- Array []
+ Array [
+   Object {
+     "id": "color-contrast",
+     "impact": "serious",
+     "nodes": 1,
+   },
+ ]
```

# Test source

```ts
  1  | // G-1 (axe gate): zero critical/serious violations while every extension
  2  | // surface is up. The extension's overlays are aria-hidden pointer-inert
  3  | // mirrors, so the assertable claim is "the extension does not degrade the
  4  | // host page's accessibility tree" — checked on the accessible baseline
  5  | // fixture with overlay + HUD + coach mark + ghost panel all visible.
  6  | import { test, expect } from "../fixtures/extension";
  7  | import { SAMPLE_PROMPT, typeAndAwaitUnderlines } from "../lib/helpers";
  8  | import { criticalA11yViolations } from "../lib/axe";
  9  | 
  10 | test("G-1 plain-textarea: no critical/serious axe violations with all surfaces visible", async ({ context, serviceWorker }) => {
  11 | 	void serviceWorker;
  12 | 	const page = await context.newPage();
  13 | 	await page.goto("/sites/plain-textarea.html");
  14 | 
  15 | 	expect(await typeAndAwaitUnderlines(page, "#composer", SAMPLE_PROMPT)).toBe(true);
  16 | 
  17 | 	// Bring up the ghost panel (review mode) and keep HUD + coach mark on screen.
  18 | 	await page.keyboard.press("Tab");
  19 | 	await page.waitForTimeout(200);
  20 | 
  21 | 	const violations = await criticalA11yViolations(page);
> 22 | 	expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
     |                                                          ^ Error: [
  23 | 
  24 | 	await page.close();
  25 | });
  26 | 
  27 | test("G-1 chatgpt fixture: extension surfaces stay out of the a11y tree", async ({ context, serviceWorker }) => {
  28 | 	void serviceWorker;
  29 | 	const page = await context.newPage();
  30 | 	await page.goto("/sites/chatgpt.html");
  31 | 
  32 | 	expect(await typeAndAwaitUnderlines(page, "#prompt-textarea", SAMPLE_PROMPT)).toBe(true);
  33 | 
  34 | 	// Every extension host must be aria-hidden (mirrors are visual-only; the
  35 | 	// content they mirror stays fully accessible in the host input).
  36 | 	const unhiddenSurfaces = await page.evaluate(() => {
  37 | 		return Array.from(
  38 | 			document.querySelectorAll(
  39 | 				"[data-insta-draft-overlay], [data-insta-draft-hover-popover], [data-insta-ghost-panel], [data-insta-keymap-hud], [data-insta-coach-mark]",
  40 | 			),
  41 | 		)
  42 | 			.filter((node) => node.getAttribute("aria-hidden") !== "true")
  43 | 			.map((node) => node.tagName);
  44 | 	});
  45 | 	expect(unhiddenSurfaces).toEqual([]);
  46 | 
  47 | 	const violations = await criticalA11yViolations(page);
  48 | 	expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  49 | 
  50 | 	await page.close();
  51 | });
  52 | 
```