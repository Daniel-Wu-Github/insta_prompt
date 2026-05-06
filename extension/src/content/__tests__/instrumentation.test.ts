// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ListenerRegistration = {
	target: EventTarget;
	type: string;
	listener: EventListenerOrEventListenerObject | null;
	options: boolean | AddEventListenerOptions | undefined;
};

type ChromeConnectHandle = {
	postMessage: ReturnType<typeof vi.fn>;
	onMessage: { addListener: ReturnType<typeof vi.fn> };
	onDisconnect: { addListener: ReturnType<typeof vi.fn> };
};

type TrackedResizeObserver = {
	observe: ReturnType<typeof vi.fn>;
	disconnect: ReturnType<typeof vi.fn>;
	trigger: () => void;
};

type ContentScriptModule = {
	default: {
		main: () => void;
	};
};

const originalAddEventListener = EventTarget.prototype.addEventListener;
const nativeMutationObserver = globalThis.MutationObserver;

let listenerRegistrations: ListenerRegistration[] = [];
let trackedObservers: MutationObserver[] = [];
let trackedResizeObservers: TrackedResizeObserver[] = [];
let lastConnectMock: ReturnType<typeof vi.fn> | undefined;

function defineContentEditable(element: HTMLElement): void {
	Object.defineProperty(element, "isContentEditable", {
		configurable: true,
		value: true,
	});
}

function countListenerRegistrations(target: EventTarget, type: string): number {
	return listenerRegistrations.filter((registration) => registration.target === target && registration.type === type).length;
}

function getLastBridgePort(): ChromeConnectHandle {
	if (!lastConnectMock) {
		throw new Error("Expected chrome.runtime.connect to be installed");
	}

	const lastResult = lastConnectMock.mock.results[lastConnectMock.mock.results.length - 1];
	if (!lastResult || lastResult.type !== "return") {
		throw new Error("Expected chrome.runtime.connect to return a bridge port mock");
	}

	return lastResult.value as ChromeConnectHandle;
}

function normalizeLoggedText(value: unknown): string {
	return String(value)
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join("\n");
}

function createMockComputedStyle(overrides: Partial<Record<string, string>> = {}): CSSStyleDeclaration {
	return {
		boxSizing: "border-box",
		font: "16px Arial",
		fontFamily: "Arial",
		fontSize: "16px",
		fontStyle: "normal",
		fontWeight: "400",
		fontStretch: "normal",
		borderTopStyle: "solid",
		borderRightStyle: "solid",
		borderBottomStyle: "solid",
		borderLeftStyle: "solid",
		borderTopWidth: "2px",
		borderRightWidth: "2px",
		borderBottomWidth: "2px",
		borderLeftWidth: "2px",
		borderTopColor: "rgb(15 23 42)",
		borderRightColor: "rgb(15 23 42)",
		borderBottomColor: "rgb(15 23 42)",
		borderLeftColor: "rgb(15 23 42)",
		borderRadius: "4px",
		fontKerning: "normal",
		fontVariant: "normal",
		fontFeatureSettings: "normal",
		fontVariationSettings: "normal",
		lineHeight: "24px",
		letterSpacing: "0px",
		textAlign: "start",
		textIndent: "0px",
		textTransform: "none",
		direction: "ltr",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
		overflowWrap: "break-word",
		paddingTop: "10px",
		paddingRight: "10px",
		paddingBottom: "10px",
		paddingLeft: "10px",
		background: "transparent",
		color: "rgb(0 0 0)",
		caretColor: "auto",
		overflow: "hidden",
		pointerEvents: "auto",
		userSelect: "auto",
		...overrides,
	} as unknown as CSSStyleDeclaration;
}

function installTestGlobals(): { connectMock: ReturnType<typeof vi.fn> } {
	const connectMock = vi.fn((): ChromeConnectHandle => {
		return {
			postMessage: vi.fn(),
			onMessage: { addListener: vi.fn() },
			onDisconnect: { addListener: vi.fn() },
		};
	});
	lastConnectMock = connectMock;

	class TrackingMutationObserver {
		private readonly observer: MutationObserver;

		constructor(callback: MutationCallback) {
			this.observer = new nativeMutationObserver(callback);
			trackedObservers.push(this.observer);
		}

		observe(target: Node, options?: MutationObserverInit): void {
			this.observer.observe(target, options);
		}

		disconnect(): void {
			this.observer.disconnect();
		}

		takeRecords(): MutationRecord[] {
			return this.observer.takeRecords();
		}
	}

	class TrackingResizeObserver {
		public readonly observe = vi.fn();
		public readonly disconnect = vi.fn();

		constructor(private readonly callback: ResizeObserverCallback) {
			trackedResizeObservers.push(this);
		}

		trigger(): void {
			this.callback([], this as unknown as ResizeObserver);
		}
	}

	vi.stubGlobal("defineContentScript", (config: unknown) => config);
	const storageGetMock = vi.fn(async () => ({}));
	vi.stubGlobal("chrome", {
		runtime: { connect: connectMock },
		storage: {
			local: { get: storageGetMock },
			session: { get: storageGetMock },
		},
	});
	vi.stubGlobal("CSS", { highlights: undefined });
	vi.stubGlobal("ResizeObserver", TrackingResizeObserver as unknown as typeof ResizeObserver);
	vi.stubGlobal("MutationObserver", TrackingMutationObserver as unknown as typeof MutationObserver);

	vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(function (
		this: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	) {
		listenerRegistrations.push({
			target: this,
			type,
			listener,
			options,
		});

		return originalAddEventListener.call(this, type, listener, options);
	});

	return { connectMock };
}

async function loadContentScript(): Promise<ContentScriptModule["default"]> {
	vi.resetModules();
	installTestGlobals();
	const module = (await import("../index.ts")) as ContentScriptModule;
	return module.default;
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	document.body.innerHTML = "";
	listenerRegistrations = [];
	trackedObservers = [];
	trackedResizeObservers = [];
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

afterEach(() => {
	for (const observer of trackedObservers) {
		observer.disconnect();
	}

	trackedObservers = [];
	trackedResizeObservers = [];
	lastConnectMock = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

describe("content script instrumentation", () => {
	it("discovers textarea and contenteditable inputs once and does not double-attach on a second scan", async () => {
		document.body.innerHTML = `
			<textarea id="notes">hello</textarea>
			<div id="editor" contenteditable="true"><div>first</div><div>second</div></div>
		`;

		const editor = document.getElementById("editor") as HTMLElement;
		defineContentEditable(editor);

		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const contentScript = await loadContentScript();
		contentScript.main();

		const textarea = document.getElementById("notes") as HTMLTextAreaElement;

		expect(textarea.getAttribute("data-insta-instrumented")).toBe("true");
		expect(editor.getAttribute("data-insta-instrumented")).toBe("true");
		expect(countListenerRegistrations(textarea, "input")).toBe(1);
		expect(countListenerRegistrations(textarea, "scroll")).toBe(1);
		expect(countListenerRegistrations(editor, "input")).toBe(1);
		expect(countListenerRegistrations(editor, "scroll")).toBe(1);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Found valid input:")).toHaveLength(2);

		contentScript.main();

		expect(countListenerRegistrations(textarea, "input")).toBe(1);
		expect(countListenerRegistrations(textarea, "scroll")).toBe(1);
		expect(countListenerRegistrations(editor, "input")).toBe(1);
		expect(countListenerRegistrations(editor, "scroll")).toBe(1);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Found valid input:")).toHaveLength(2);
	});

	it("debounces rapid typing, aborts stale work, and preserves contenteditable newlines", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `
			<div id="editor" contenteditable="true">
				<div>First clause</div>
				<div>Second clause<br>Third clause</div>
			</div>
		`;

		const editor = document.getElementById("editor") as HTMLElement;
		defineContentEditable(editor);

		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const abortSpy = vi.spyOn(AbortController.prototype, "abort");

		const contentScript = await loadContentScript();
		contentScript.main();
		consoleLogSpy.mockClear();
		const bridgePort = getLastBridgePort();

		const firstInput = new Event("input", { bubbles: true });
		const secondInput = new Event("input", { bubbles: true });
		const thirdInput = new Event("input", { bubbles: true });

		editor.dispatchEvent(firstInput);
		editor.dispatchEvent(secondInput);
		editor.dispatchEvent(thirdInput);

		expect(abortSpy).toHaveBeenCalledTimes(2);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Debounced extracted text:\n")).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(399);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Debounced extracted text:\n")).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(1);
		await flushMicrotasks();

		const debouncedLogs = consoleLogSpy.mock.calls.filter((call) => call[0] === "Debounced extracted text:\n");
		expect(debouncedLogs).toHaveLength(1);
		expect(normalizeLoggedText(debouncedLogs[0]?.[1])).toBe("First clause\nSecond clause\nThird clause");
		expect(bridgePort.postMessage).toHaveBeenCalledTimes(1);
		const bridgePayload = bridgePort.postMessage.mock.calls[0]?.[0] as {
			verb?: string;
			jwt?: string;
			payload?: { segments?: string[]; mode?: string };
		} | undefined;

		expect(bridgePayload?.verb).toBe("SEGMENT");
		expect(bridgePayload?.jwt).toEqual(expect.any(String));
		expect(bridgePayload?.payload?.mode).toBe("balanced");
		expect(bridgePayload?.payload?.segments).toHaveLength(1);
		expect(normalizeLoggedText(bridgePayload?.payload?.segments?.[0])).toBe("First clause\nSecond clause\nThird clause");
	});

	it("reattaches to dynamically added inputs and ignores marker attribute churn", async () => {
		document.body.innerHTML = `<div id="host"></div>`;

		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const contentScript = await loadContentScript();
		contentScript.main();
		consoleLogSpy.mockClear();

		const host = document.getElementById("host") as HTMLElement;
		const dynamicInput = document.createElement("textarea");
		dynamicInput.id = "dynamic-input";
		host.appendChild(dynamicInput);

		await flushMicrotasks();

		expect(dynamicInput.getAttribute("data-insta-instrumented")).toBe("true");
		expect(countListenerRegistrations(dynamicInput, "input")).toBe(1);
		expect(countListenerRegistrations(dynamicInput, "scroll")).toBe(1);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Found valid input:")).toHaveLength(1);

		dynamicInput.setAttribute("data-insta-instrumented", "pending");
		dynamicInput.setAttribute("data-insta-instrumented", "true");

		await flushMicrotasks();

		expect(countListenerRegistrations(dynamicInput, "input")).toBe(1);
		expect(countListenerRegistrations(dynamicInput, "scroll")).toBe(1);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Found valid input:")).toHaveLength(1);
	});

	it("mirrors computed geometry exactly and keeps the host DOM unchanged", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `<textarea id="notes"></textarea>`;
		const textarea = document.getElementById("notes") as HTMLTextAreaElement;
		textarea.value = "Geometry mirror test. Another sentence.";

		const hostInnerHTMLBefore = textarea.innerHTML;
		const hostTextContentBefore = textarea.textContent;
		const mockComputedStyle = createMockComputedStyle({
			font: "16px Arial",
			fontFamily: "Arial",
			fontSize: "16px",
			paddingTop: "10px",
			paddingRight: "10px",
			paddingBottom: "10px",
			paddingLeft: "10px",
			lineHeight: "24px",
			letterSpacing: "0px",
			whiteSpace: "pre-wrap",
			borderTopWidth: "2px",
			borderRightWidth: "2px",
			borderBottomWidth: "2px",
			borderLeftWidth: "2px",
		});
		vi.spyOn(window, "getComputedStyle").mockImplementation(() => mockComputedStyle);

		let rect = {
			x: 24,
			y: 36,
			left: 24,
			top: 36,
			width: 280,
			height: 120,
			right: 304,
			bottom: 156,
			toJSON: () => undefined,
		} as DOMRect;

		Object.defineProperty(textarea, "getBoundingClientRect", {
			configurable: true,
			value: () => rect,
		});

		const contentScript = await loadContentScript();
		contentScript.main();

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);

		const overlay = document.querySelector('[data-insta-draft-overlay="true"]') as HTMLDivElement | null;
		expect(overlay).not.toBeNull();
		if (!overlay) {
			throw new Error("Expected mirror overlay to render");
		}

		expect(overlay.style.pointerEvents).toBe("none");
		expect(overlay.style.left).toBe("24px");
		expect(overlay.style.top).toBe("36px");
		expect(overlay.style.width).toBe("280px");
		expect(overlay.style.height).toBe("120px");
		expect(overlay.style.fontFamily).toBe("Arial");
		expect(overlay.style.fontSize).toBe("16px");
		expect(overlay.style.lineHeight).toBe("24px");
		expect(overlay.style.paddingTop).toBe("10px");
		expect(overlay.style.paddingRight).toBe("10px");
		expect(overlay.style.paddingBottom).toBe("10px");
		expect(overlay.style.paddingLeft).toBe("10px");
		expect(overlay.style.borderTopWidth).toBe("2px");
		expect(overlay.style.borderRightWidth).toBe("2px");
		expect(overlay.style.borderBottomWidth).toBe("2px");
		expect(overlay.style.borderLeftWidth).toBe("2px");
		expect(overlay.style.whiteSpace).toBe("pre-wrap");

		textarea.scrollTop = 29;
		textarea.scrollLeft = 17;
		textarea.dispatchEvent(new Event("scroll", { bubbles: true }));

		expect(overlay.scrollTop).toBe(29);
		expect(overlay.scrollLeft).toBe(17);

		expect(textarea.innerHTML).toBe(hostInnerHTMLBefore);
		expect(textarea.textContent).toBe(hostTextContentBefore);
		expect(textarea.querySelector("span")).toBeNull();
	});

	it("renders confidence-aware goal-type underlines and keeps the mirror overlay stale-safe during typing", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `<textarea id="notes"></textarea>`;
		const textarea = document.getElementById("notes") as HTMLTextAreaElement;

		textarea.value = "Build the toggle UI. Use React and TypeScript. Maybe later.";
		const hostInnerHTMLBefore = textarea.innerHTML;
		const hostTextContentBefore = textarea.textContent;
		textarea.style.boxSizing = "border-box";
		textarea.style.border = "3px solid rgb(15 23 42)";
		textarea.style.fontFamily = "monospace";
		textarea.style.fontSize = "18px";
		textarea.style.fontStyle = "italic";
		textarea.style.fontWeight = "700";
		textarea.style.lineHeight = "1.5";
		textarea.style.letterSpacing = "1.25px";
		textarea.style.padding = "8px 12px";
		textarea.style.whiteSpace = "pre-wrap";

		let rect = {
			x: 48,
			y: 72,
			left: 48,
			top: 72,
			width: 260,
			height: 140,
			right: 308,
			bottom: 212,
			toJSON: () => undefined,
		} as DOMRect;

		Object.defineProperty(textarea, "getBoundingClientRect", {
			configurable: true,
			value: () => rect,
		});

		const contentScript = await loadContentScript();
		contentScript.main();

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);

		expect(trackedResizeObservers).toHaveLength(1);
		expect(trackedResizeObservers[0]?.observe).toHaveBeenCalledWith(textarea);

		const overlay = document.querySelector('[data-insta-draft-overlay="true"]') as HTMLDivElement | null;
		expect(overlay).not.toBeNull();
		if (!overlay) {
			throw new Error("Expected mirror overlay to render");
		}

		const overlayContent = overlay.firstElementChild as HTMLDivElement | null;
		expect(overlayContent).not.toBeNull();
		if (!overlayContent) {
			throw new Error("Expected mirror overlay content to render");
		}

		const segmentRoot = overlayContent.firstElementChild as HTMLDivElement | null;
		expect(segmentRoot).not.toBeNull();
		if (!segmentRoot) {
			throw new Error("Expected semantic segment root to render");
		}

		const segmentSpans = Array.from(segmentRoot.querySelectorAll("span[data-goal-type]")) as HTMLSpanElement[];
		expect(segmentSpans).toHaveLength(3);

		expect(overlay.style.pointerEvents).toBe("none");
		expect(overlay.style.left).toBe("48px");
		expect(overlay.style.top).toBe("72px");
		expect(overlay.style.width).toBe("260px");
		expect(overlay.style.height).toBe("140px");
		expect(overlay.style.boxSizing).toBe("border-box");
		expect(overlay.style.borderTopWidth).toBe("3px");
		expect(overlay.style.fontFamily).toContain("monospace");
		expect(overlay.style.fontSize).toBe("18px");
		expect(overlay.style.fontStyle).toBe("italic");
		expect(overlay.style.fontWeight).toBe("700");
		expect(overlay.style.lineHeight).toBe("1.5");
		expect(overlay.style.letterSpacing).toBe("1.25px");
		expect(overlay.style.paddingTop).toBe("8px");
		expect(overlay.style.whiteSpace).toBe("pre-wrap");
		expect(overlay.style.getPropertyValue("--insta-goal-type-action-color")).toBe("rgb(21 128 61)");
		expect(overlay.style.getPropertyValue("--insta-goal-type-tech-stack-color")).toBe("rgb(29 78 216)");
		expect(overlay.style.getPropertyValue("--insta-goal-type-context-color")).toBe("rgb(15 118 110)");
		expect(overlay.style.getPropertyValue("--insta-goal-type-constraint-color")).toBe("rgb(180 83 9)");
		expect(overlay.style.getPropertyValue("--insta-goal-type-edge-case-color")).toBe("rgb(185 28 28)");
		expect(overlay.style.getPropertyValue("--insta-goal-type-output-format-color")).toBe("rgb(109 40 217)");
		expect(overlay.style.opacity).toBe("1");

		expect(segmentSpans[0]?.dataset.goalType).toBe("action");
		expect(segmentSpans[0]?.style.color).toBe("transparent");
		expect(segmentSpans[0]?.style.textDecorationColor).toBe("var(--insta-goal-type-action-color)");
		expect(segmentSpans[0]?.style.textDecorationStyle).toBe("solid");

		expect(segmentSpans[1]?.dataset.goalType).toBe("tech_stack");
		expect(segmentSpans[1]?.style.textDecorationColor).toBe("var(--insta-goal-type-tech-stack-color)");
		expect(segmentSpans[1]?.style.textDecorationStyle).toBe("solid");

		expect(segmentSpans[2]?.dataset.goalType).toBe("context");
		expect(segmentSpans[2]?.style.textDecorationColor).toBe("var(--insta-goal-type-context-color)");
		expect(segmentSpans[2]?.style.textDecorationStyle).toBe("dashed");
		expect(segmentSpans[2]?.dataset.confidence).toBe("0.42");

		expect(textarea.innerHTML).toBe(hostInnerHTMLBefore);
		expect(textarea.textContent).toBe(hostTextContentBefore);
		expect(textarea.querySelector("span")).toBeNull();

		textarea.value = "Build the toggle UI. Use React and TypeScript. Maybe later with more notes.";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));

		expect(overlay.style.opacity).toBe("0.45");

		await vi.advanceTimersByTimeAsync(400);

		expect(trackedResizeObservers).toHaveLength(2);

		const refreshedOverlay = document.querySelector('[data-insta-draft-overlay="true"]') as HTMLDivElement | null;
		expect(refreshedOverlay).not.toBeNull();
		if (!refreshedOverlay) {
			throw new Error("Expected refreshed mirror overlay to render");
		}

		expect(refreshedOverlay).not.toBe(overlay);
		expect(refreshedOverlay.style.opacity).toBe("1");

		const refreshedContent = refreshedOverlay.firstElementChild as HTMLDivElement | null;
		expect(refreshedContent).not.toBeNull();
		if (!refreshedContent) {
			throw new Error("Expected refreshed mirror overlay content to render");
		}

		const refreshedRoot = refreshedContent.firstElementChild as HTMLDivElement | null;
		expect(refreshedRoot).not.toBeNull();
		if (!refreshedRoot) {
			throw new Error("Expected refreshed semantic segment root to render");
		}

		const refreshedSpans = Array.from(refreshedRoot.querySelectorAll("span[data-goal-type]")) as HTMLSpanElement[];
		expect(refreshedSpans).toHaveLength(3);

		textarea.scrollTop = 37;
		textarea.scrollLeft = 19;
		textarea.dispatchEvent(new Event("scroll", { bubbles: true }));

		expect(refreshedOverlay.scrollTop).toBe(37);
		expect(refreshedOverlay.scrollLeft).toBe(19);
		expect(refreshedContent.style.transform).toBe("translate(-19px, -37px)");

		rect = {
			x: 96,
			y: 132,
			left: 96,
			top: 132,
			width: 320,
			height: 180,
			right: 416,
			bottom: 312,
			toJSON: () => undefined,
		} as DOMRect;

		trackedResizeObservers[trackedResizeObservers.length - 1]?.trigger();

		expect(refreshedOverlay.style.left).toBe("96px");
		expect(refreshedOverlay.style.top).toBe("132px");
		expect(refreshedOverlay.style.width).toBe("320px");
		expect(refreshedOverlay.style.height).toBe("180px");

	});

	it("shows a shadow-dom hover popover and dismisses it on scroll, escape, blur, and mouse leave", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `<textarea id="notes"></textarea>`;
		const textarea = document.getElementById("notes") as HTMLTextAreaElement;
		textarea.value = "Build the toggle UI. Use React and TypeScript. Maybe later with more notes.";
		textarea.style.boxSizing = "border-box";
		textarea.style.border = "3px solid rgb(15 23 42)";
		textarea.style.fontFamily = "monospace";
		textarea.style.fontSize = "18px";
		textarea.style.lineHeight = "1.5";
		textarea.style.letterSpacing = "1.25px";
		textarea.style.padding = "8px 12px";
		textarea.style.whiteSpace = "pre-wrap";

		Object.defineProperty(textarea, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				x: 40,
				y: 60,
				left: 40,
				top: 60,
				width: 320,
				height: 160,
				right: 360,
				bottom: 220,
				toJSON: () => undefined,
			} as DOMRect),
		});

		const contentScript = await loadContentScript();
		contentScript.main();

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);

		const overlay = document.querySelector('[data-insta-draft-overlay="true"]') as HTMLDivElement | null;
		expect(overlay).not.toBeNull();
		if (!overlay) {
			throw new Error("Expected overlay to render before hovering");
		}

		const firstSpan = overlay.querySelector('span[data-goal-type][data-segment-index="0"]') as HTMLSpanElement | null;
		expect(firstSpan).not.toBeNull();
		if (!firstSpan) {
			throw new Error("Expected first semantic underline span to render");
		}

		Object.defineProperty(firstSpan, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				left: 120,
				top: 90,
				right: 230,
				bottom: 110,
				width: 110,
				height: 20,
				x: 120,
				y: 90,
				toJSON: () => undefined,
			} as DOMRect),
		});

		textarea.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 140, clientY: 100 }));

		let hoverPopover = document.querySelector('[data-insta-draft-hover-popover="true"]') as HTMLDivElement | null;
		expect(hoverPopover).not.toBeNull();
		if (!hoverPopover) {
			throw new Error("Expected hover popover to open");
		}

		expect(hoverPopover.style.position).toBe("fixed");
		expect(hoverPopover.style.zIndex).toBe("2147483647");
		expect(hoverPopover.style.left).toBe("120px");
		expect(hoverPopover.style.top).toBe("120px");
		expect(hoverPopover.shadowRoot).not.toBeNull();
		expect(hoverPopover.shadowRoot?.querySelector("style")).not.toBeNull();
		expect(hoverPopover.shadowRoot?.querySelector('[data-draft-hover-panel="true"]')).not.toBeNull();
		expect(hoverPopover.shadowRoot?.textContent ?? "").toContain("Loading preview...");

		await vi.advanceTimersByTimeAsync(120);
		hoverPopover = document.querySelector('[data-insta-draft-hover-popover="true"]') as HTMLDivElement | null;
		expect(hoverPopover?.shadowRoot?.textContent ?? "").toContain("Ready");
		expect(hoverPopover?.shadowRoot?.textContent ?? "").toContain("action preview: Build the toggle UI.");

		textarea.value = "Build the toggle UI. Use React and TypeScript. Maybe later with more notes and updates.";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));

		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')?.shadowRoot?.textContent ?? "").toContain("outdated");

		textarea.dispatchEvent(new Event("scroll", { bubbles: true }));
		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')).toBeNull();

		textarea.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 140, clientY: 100 }));
		await vi.advanceTimersByTimeAsync(120);
		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')).not.toBeNull();

		textarea.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')).toBeNull();

		textarea.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 140, clientY: 100 }));
		await vi.advanceTimersByTimeAsync(120);
		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')).not.toBeNull();

		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')).toBeNull();

		textarea.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 140, clientY: 100 }));
		await vi.advanceTimersByTimeAsync(120);
		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')).not.toBeNull();

		textarea.dispatchEvent(new Event("blur", { bubbles: false }));
		expect(document.querySelector('[data-insta-draft-hover-popover="true"]')).toBeNull();
	});
});