// Shared helpers for driving the extension on fixture pages.
import type { Page } from "@playwright/test";

// The 8-site fixture matrix (mirrors human/03_MANUAL_TESTING_GUIDE.md).
// `editor` is the selector of the instrumentable input on each page;
// `kind` drives typing + churn strategy.
export type SiteFixture = {
	name: string;
	path: string;
	editor: string;
	kind: "textarea" | "contenteditable";
};

export const SITES: SiteFixture[] = [
	{ name: "plain-textarea", path: "/sites/plain-textarea.html", editor: "#composer", kind: "textarea" },
	{ name: "chatgpt", path: "/sites/chatgpt.html", editor: "#prompt-textarea", kind: "contenteditable" },
	{ name: "claude", path: "/sites/claude.html", editor: ".ProseMirror", kind: "contenteditable" },
	{ name: "notion", path: "/sites/notion.html", editor: "[data-content-editable-leaf]", kind: "contenteditable" },
	{ name: "linear", path: "/sites/linear.html", editor: ".editor-root", kind: "contenteditable" },
	{ name: "github", path: "/sites/github.html", editor: "#issue_body", kind: "textarea" },
	{ name: "gmail", path: "/sites/gmail.html", editor: "[aria-label='Message Body']", kind: "contenteditable" },
	{ name: "slack", path: "/sites/slack.html", editor: ".ql-editor", kind: "contenteditable" },
];

export const SAMPLE_PROMPT = "Build a dark mode toggle. Use React and Tailwind. Keep bundle size small.";

// Wait until the content script has instrumented the editor. On a cold
// persistent context the script injects noticeably after page load, and typing
// that finishes before its input listener attaches renders nothing — the
// DevTools-visibility attribute doubles as the exact readiness signal.
export async function awaitInstrumented(page: Page, editorSelector: string): Promise<void> {
	await page.waitForFunction(
		(selector) => document.querySelector(selector)?.getAttribute("data-insta-instrumented") === "true",
		editorSelector,
		{ timeout: 10_000 },
	);
}

// Type into the fixture editor with real key events so the content script's
// input listeners fire, then wait out the 400ms debounce until underlines
// render (or return false on timeout).
export async function typeAndAwaitUnderlines(page: Page, editorSelector: string, text: string): Promise<boolean> {
	await awaitInstrumented(page, editorSelector);
	await page.click(editorSelector);
	await page.keyboard.type(text, { delay: 5 });
	try {
		await page.waitForSelector('[data-insta-draft-overlay="true"]', { state: "attached", timeout: 5_000 });
		// Spans render into the overlay's open shadow root.
		await page.waitForFunction(() => {
			const overlay = document.querySelector('[data-insta-draft-overlay="true"]');
			return (overlay?.shadowRoot?.querySelectorAll("span[data-segment-index]").length ?? 0) > 0;
		}, undefined, { timeout: 5_000 });
		return true;
	} catch {
		return false;
	}
}

export function countOverlayHosts(page: Page): Promise<number> {
	return page.evaluate(() => document.querySelectorAll('[data-insta-draft-overlay="true"]').length);
}

export function overlaySpanCount(page: Page): Promise<number> {
	return page.evaluate(() => {
		const overlay = document.querySelector('[data-insta-draft-overlay="true"]');
		return overlay?.shadowRoot?.querySelectorAll("span[data-segment-index]").length ?? 0;
	});
}

export function hasUnsupportedToast(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		return Array.from(document.querySelectorAll("div")).some((node) =>
			node.shadowRoot?.querySelector("[data-unsupported-toast]"),
		);
	});
}

// Simulate a React/SPA re-render: replace the editor node with a fresh clone
// (what ChatGPT's reconciler and Linear's route changes do to us).
export async function churnEditorNode(page: Page, editorSelector: string): Promise<void> {
	await page.evaluate((selector) => {
		const editor = document.querySelector<HTMLElement>(selector);
		if (!editor) {
			throw new Error(`no editor for selector ${selector}`);
		}
		const clone = editor.cloneNode(true) as HTMLElement;
		// React strips foreign attributes on re-render — mimic that.
		clone.removeAttribute("data-insta-instrumented");
		editor.replaceWith(clone);
	}, editorSelector);
	// The attribute we stripped reappears exactly when the discovery observer
	// has re-instrumented the clone — the deterministic "ready again" signal.
	await awaitInstrumented(page, editorSelector);
}
