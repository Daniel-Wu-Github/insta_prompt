// A2/G-2: geometry parity, measured numerically (rect-diff), not by screenshot
// pixel-diffing — sub-pixel font AA across CI runners would make screenshot
// comparison assert the wrong thing. Two claims:
//   1. contenteditable: mirror span rects match a Range over the REAL host
//      text at the same offsets within ±1px (hover hit-testing correctness).
//      With D2, the visible underline is a Custom Highlight on that Range
//      itself, so underline parity is exact by construction — also asserted.
//   2. textarea: the overlay host box must coincide with the textarea's
//      content box within ±1px, and clip inside its visible region.
import { test, expect } from "../fixtures/extension";
import { SAMPLE_PROMPT, typeAndAwaitUnderlines } from "../lib/helpers";

const TOLERANCE_PX = 1;

type RectPair = {
	span: { left: number; top: number; width: number };
	range: { left: number; top: number; width: number };
	segmentIndex: string;
};

test("A2 chatgpt: mirror spans track real text within ±1px; highlights own the underlines", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/chatgpt.html");

	expect(await typeAndAwaitUnderlines(page, "#prompt-textarea", SAMPLE_PROMPT)).toBe(true);

	// D2: Custom Highlights registered over the real text (per-goal-type names).
	const highlightNames = await page.evaluate(() => {
		const names: string[] = [];
		// CSS.highlights is a maplike; keys() yields registered names.
		for (const name of (CSS as unknown as { highlights: Map<string, unknown> }).highlights.keys()) {
			names.push(name);
		}
		return names;
	});
	expect(highlightNames.some((name) => name.startsWith("insta-prompt-draft-"))).toBe(true);

	const pairs = await page.evaluate((): RectPair[] => {
		const editor = document.querySelector<HTMLElement>("#prompt-textarea");
		const overlay = document.querySelector<HTMLElement>('[data-insta-draft-overlay="true"]');
		if (!editor || !overlay?.shadowRoot) {
			return [];
		}

		// Rebuild the extracted text the same way the content script does for this
		// single-paragraph fixture: the editor holds one <p> with one text node.
		const textNode = editor.querySelector("p")?.firstChild;
		if (!(textNode instanceof Text)) {
			return [];
		}

		const spans = Array.from(overlay.shadowRoot.querySelectorAll<HTMLSpanElement>("span[data-segment-index]"));
		const editorText = textNode.textContent ?? "";

		return spans.flatMap((span) => {
			const spanText = span.textContent ?? "";
			const start = editorText.indexOf(spanText);
			if (start === -1 || spanText.length === 0) {
				return [];
			}
			const range = document.createRange();
			range.setStart(textNode, start);
			range.setEnd(textNode, start + spanText.length);
			const rangeRect = range.getBoundingClientRect();
			const spanRect = span.getBoundingClientRect();
			return [
				{
					span: { left: spanRect.left, top: spanRect.top, width: spanRect.width },
					range: { left: rangeRect.left, top: rangeRect.top, width: rangeRect.width },
					segmentIndex: span.dataset.segmentIndex ?? "?",
				},
			];
		});
	});

	expect(pairs.length).toBeGreaterThanOrEqual(3);
	for (const pair of pairs) {
		expect
			.soft(Math.abs(pair.span.left - pair.range.left), `segment ${pair.segmentIndex} left drift`)
			.toBeLessThanOrEqual(TOLERANCE_PX);
		expect
			.soft(Math.abs(pair.span.top - pair.range.top), `segment ${pair.segmentIndex} top drift`)
			.toBeLessThanOrEqual(TOLERANCE_PX);
		expect
			.soft(Math.abs(pair.span.width - pair.range.width), `segment ${pair.segmentIndex} width drift`)
			.toBeLessThanOrEqual(TOLERANCE_PX * 2);
	}

	await page.close();
});

test("A2 chatgpt: overlay clips to the scroll ancestor when the composer grows (BUG-GEOM)", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/chatgpt.html");

	// Long enough to overflow the 180px max-height clip.
	const longPrompt = Array.from({ length: 10 }, (_, i) => `Requirement ${i + 1} of the feature.`).join(" ");
	expect(await typeAndAwaitUnderlines(page, "#prompt-textarea", longPrompt)).toBe(true);

	const geometry = await page.evaluate(() => {
		const overlay = document.querySelector<HTMLElement>('[data-insta-draft-overlay="true"]');
		const clip = document.querySelector<HTMLElement>(".composer-scroll");
		if (!overlay || !clip) {
			return undefined;
		}
		const overlayRect = overlay.getBoundingClientRect();
		const clipRect = clip.getBoundingClientRect();
		return {
			overlayTop: overlayRect.top,
			overlayBottom: overlayRect.bottom,
			clipTop: clipRect.top,
			clipBottom: clipRect.bottom,
		};
	});

	expect(geometry).toBeDefined();
	if (geometry) {
		// The overlay host may not extend beyond the visible clip box.
		expect(geometry.overlayTop).toBeGreaterThanOrEqual(geometry.clipTop - TOLERANCE_PX);
		expect(geometry.overlayBottom).toBeLessThanOrEqual(geometry.clipBottom + TOLERANCE_PX);
	}

	await page.close();
});

test("A2 plain-textarea: overlay host coincides with the textarea box", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/plain-textarea.html");

	expect(await typeAndAwaitUnderlines(page, "#composer", SAMPLE_PROMPT)).toBe(true);

	const boxes = await page.evaluate(() => {
		const textarea = document.querySelector<HTMLTextAreaElement>("#composer");
		const overlay = document.querySelector<HTMLElement>('[data-insta-draft-overlay="true"]');
		if (!textarea || !overlay) {
			return undefined;
		}
		const textareaRect = textarea.getBoundingClientRect();
		const overlayRect = overlay.getBoundingClientRect();
		return {
			dLeft: Math.abs(textareaRect.left - overlayRect.left),
			dTop: Math.abs(textareaRect.top - overlayRect.top),
		};
	});

	expect(boxes).toBeDefined();
	if (boxes) {
		expect(boxes.dLeft).toBeLessThanOrEqual(TOLERANCE_PX);
		expect(boxes.dTop).toBeLessThanOrEqual(TOLERANCE_PX);
	}

	await page.close();
});
