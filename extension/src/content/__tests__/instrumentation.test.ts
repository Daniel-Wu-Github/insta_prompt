// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContentChromeMock, createContentScriptCtx, DEFAULT_TEST_AUTH } from "../../test/chrome-mock";

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
		main: (ctx: { onInvalidated: (callback: () => void) => void }) => void;
	};
};

const originalAddEventListener = EventTarget.prototype.addEventListener;
const nativeMutationObserver = globalThis.MutationObserver;

let listenerRegistrations: ListenerRegistration[] = [];
let trackedObservers: MutationObserver[] = [];
let trackedResizeObservers: TrackedResizeObserver[] = [];
let lastConnectMock: ReturnType<typeof vi.fn> | undefined;
const DEFAULT_AUTH = DEFAULT_TEST_AUTH;

// D1: the overlay mirror content now lives inside the host's shadow root
// ([style, contentElement]), so tests pierce it instead of walking light-DOM
// children. The host element itself still carries the geometry inline styles.
function getOverlayContent(overlay: HTMLElement): HTMLDivElement | null {
	return overlay.shadowRoot?.querySelector("div") ?? null;
}

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

function getChromeStorageGetMock(area: "local" | "session" | "sync"): ReturnType<typeof vi.fn> {
	const chromeStorage = chrome as unknown as {
		storage: {
			local: { get: ReturnType<typeof vi.fn> };
			session: { get: ReturnType<typeof vi.fn> };
			sync: { get: ReturnType<typeof vi.fn> };
		};
	};

	return chromeStorage.storage[area].get;
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
		// BUG-ALIGN copies tab-size / text-rendering / font-optical-sizing via
		// getPropertyValue (they are not camelCase style fields).
		getPropertyValue: (property: string): string => {
			const hyphenless: Record<string, string> = {
				"tab-size": "8",
				"text-rendering": "auto",
				"font-optical-sizing": "auto",
			};
			return hyphenless[property] ?? "";
		},
	} as unknown as CSSStyleDeclaration;
}

// Post-BUG-GEOM, overlay geometry derives from clientWidth/clientHeight (the
// self-clip content box), which jsdom always reports as 0. Mirror the mocked
// bounding rect so the overlay sizes the way a real browser would.
function mockClientBox(element: HTMLElement, rectRef: () => { width: number; height: number }): void {
	Object.defineProperty(element, "clientWidth", {
		configurable: true,
		get: () => rectRef().width,
	});
	Object.defineProperty(element, "clientHeight", {
		configurable: true,
		get: () => rectRef().height,
	});
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
	// C3: chrome surface comes from the shared fixture (includes storage.onChanged,
	// whose absence crashed main() and produced 7 of the 13 stale failures here).
	const chromeMock = createContentChromeMock({ auth: DEFAULT_AUTH });
	// Keep this file's bridge-port tracker pointed at the shared connect mock.
	(chromeMock.chromeStub.runtime as { connect: typeof connectMock }).connect = connectMock;
	vi.stubGlobal("chrome", chromeMock.chromeStub);
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
		contentScript.main(createContentScriptCtx());

		const textarea = document.getElementById("notes") as HTMLTextAreaElement;

		expect(textarea.getAttribute("data-insta-instrumented")).toBe("true");
		expect(editor.getAttribute("data-insta-instrumented")).toBe("true");
		expect(countListenerRegistrations(textarea, "input")).toBe(1);
		expect(countListenerRegistrations(editor, "input")).toBe(1);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Found valid input:")).toHaveLength(2);

		contentScript.main(createContentScriptCtx());

		expect(countListenerRegistrations(textarea, "input")).toBe(1);
		expect(countListenerRegistrations(editor, "input")).toBe(1);
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
		contentScript.main(createContentScriptCtx());
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

	it("keeps resolving bridge context when session storage access is blocked", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `<textarea id="notes">Build a keyboard-accessible dark mode toggle.</textarea>`;
		const textarea = document.getElementById("notes") as HTMLTextAreaElement;

		const contentScript = await loadContentScript();
		contentScript.main(createContentScriptCtx());

		getChromeStorageGetMock("local").mockResolvedValue({
			["promptcompiler.settings"]: {
				mode: "detailed",
				projectId: null,
			},
			authCache: {
				access_token: "local-storage-jwt",
			},
		});
		getChromeStorageGetMock("session").mockRejectedValue(new Error("Access to storage is not allowed from this context."));

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);
		await flushMicrotasks();

		const bridgePort = getLastBridgePort();
		expect(bridgePort.postMessage).toHaveBeenCalledTimes(1);

		const bridgePayload = bridgePort.postMessage.mock.calls[0]?.[0] as {
			verb?: string;
			jwt?: string;
			payload?: { segments?: string[]; mode?: string };
		} | undefined;

		expect(bridgePayload?.verb).toBe("SEGMENT");
		expect(bridgePayload?.jwt).toBe("local-storage-jwt");
		expect(bridgePayload?.payload?.mode).toBe("detailed");
		expect(normalizeLoggedText(bridgePayload?.payload?.segments?.[0])).toBe("Build a keyboard-accessible dark mode toggle.");
	});

	it("reattaches to dynamically added inputs and ignores marker attribute churn", async () => {
		document.body.innerHTML = `<div id="host"></div>`;

		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const contentScript = await loadContentScript();
		contentScript.main(createContentScriptCtx());
		consoleLogSpy.mockClear();

		const host = document.getElementById("host") as HTMLElement;
		const dynamicInput = document.createElement("textarea");
		dynamicInput.id = "dynamic-input";
		host.appendChild(dynamicInput);

		await flushMicrotasks();

		expect(dynamicInput.getAttribute("data-insta-instrumented")).toBe("true");
		expect(countListenerRegistrations(dynamicInput, "input")).toBe(1);
		expect(consoleLogSpy.mock.calls.filter((call) => call[0] === "Found valid input:")).toHaveLength(1);

		dynamicInput.setAttribute("data-insta-instrumented", "pending");
		dynamicInput.setAttribute("data-insta-instrumented", "true");

		await flushMicrotasks();

		expect(countListenerRegistrations(dynamicInput, "input")).toBe(1);
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
		mockClientBox(textarea, () => rect);

		const contentScript = await loadContentScript();
		contentScript.main(createContentScriptCtx());

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
		expect(overlay.style.paddingTop).toBe("0px");
		expect(overlay.style.paddingRight).toBe("0px");
		expect(overlay.style.paddingBottom).toBe("0px");
		expect(overlay.style.paddingLeft).toBe("0px");
		expect(overlay.style.borderTopWidth).toBe("0px");
		expect(overlay.style.borderRightWidth).toBe("0px");
		expect(overlay.style.borderBottomWidth).toBe("0px");
		expect(overlay.style.borderLeftWidth).toBe("0px");
		expect(overlay.style.whiteSpace).toBe("pre-wrap");

		textarea.scrollTop = 29;
		textarea.scrollLeft = 17;
		textarea.dispatchEvent(new Event("scroll", { bubbles: true }));

		const overlayContent = getOverlayContent(overlay);
		expect(overlayContent).not.toBeNull();
		if (!overlayContent) {
			throw new Error("Expected mirror overlay content to render");
		}

		expect(overlayContent.style.transform).toBe("translate(-17px, -29px)");

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
		mockClientBox(textarea, () => rect);

		const contentScript = await loadContentScript();
		contentScript.main(createContentScriptCtx());

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);

		expect(trackedResizeObservers).toHaveLength(1);
		expect(trackedResizeObservers[0]?.observe).toHaveBeenCalledWith(textarea);

		const overlay = document.querySelector('[data-insta-draft-overlay="true"]') as HTMLDivElement | null;
		expect(overlay).not.toBeNull();
		if (!overlay) {
			throw new Error("Expected mirror overlay to render");
		}

		const overlayContent = getOverlayContent(overlay);
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
		expect(overlay.style.borderTopWidth).toBe("0px");
		expect(overlay.style.fontFamily).toContain("monospace");
		expect(overlay.style.fontSize).toBe("18px");
		expect(overlay.style.fontStyle).toBe("italic");
		expect(overlay.style.fontWeight).toBe("700");
		expect(overlay.style.lineHeight).toBe("1.5");
		expect(overlay.style.letterSpacing).toBe("1.25px");
		expect(overlay.style.paddingTop).toBe("0px");
		expect(overlay.style.whiteSpace).toBe("pre-wrap");
		// AUD-2: palette values come from the locked design tokens (clauseAccent),
		// stored as hex. The old rgb() literals predate the tokenization.
		expect(overlay.style.getPropertyValue("--insta-goal-type-action-color")).toBe("#7c3aed");
		expect(overlay.style.getPropertyValue("--insta-goal-type-tech-stack-color")).toBe("#0d9488");
		expect(overlay.style.getPropertyValue("--insta-goal-type-context-color")).toBe("#d97706");
		expect(overlay.style.getPropertyValue("--insta-goal-type-constraint-color")).toBe("#e11d48");
		expect(overlay.style.getPropertyValue("--insta-goal-type-edge-case-color")).toBe("#6b7280");
		expect(overlay.style.getPropertyValue("--insta-goal-type-output-format-color")).toBe("#2563eb");
		expect(overlay.style.opacity).toBe("1");

		for (const segment of segmentSpans) {
			expect(segment?.style.color).toBe("transparent");
			expect(segment?.style.textDecorationColor).toMatch(/^var\(--insta-goal-type-/);
			expect(segment?.style.textDecorationStyle).toMatch(/^(solid|dashed)$/);
		}

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

		expect(refreshedOverlay.style.opacity).toBe("1");

		const refreshedContent = getOverlayContent(refreshedOverlay);
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

		const hoverRect = {
			x: 40,
			y: 60,
			left: 40,
			top: 60,
			width: 320,
			height: 160,
			right: 360,
			bottom: 220,
			toJSON: () => undefined,
		} as DOMRect;
		Object.defineProperty(textarea, "getBoundingClientRect", {
			configurable: true,
			value: () => hoverRect,
		});
		mockClientBox(textarea, () => hoverRect);

		const contentScript = await loadContentScript();
		contentScript.main(createContentScriptCtx());

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);

		const overlay = document.querySelector('[data-insta-draft-overlay="true"]') as HTMLDivElement | null;
		expect(overlay).not.toBeNull();
		if (!overlay) {
			throw new Error("Expected overlay to render before hovering");
		}

		const firstSpan = overlay.shadowRoot?.querySelector('span[data-goal-type][data-segment-index="0"]') as HTMLSpanElement | null;
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
		// BUG-2.2: the popover anchors to the CURSOR (clientX/Y = 140,100), offset
		// 18px below it — not to the clause span rect the old assertions assumed.
		expect(hoverPopover.style.left).toBe("140px");
		expect(hoverPopover.style.top).toBe("118px");
		expect(hoverPopover.shadowRoot).not.toBeNull();
		expect(hoverPopover.shadowRoot?.querySelector("style")).not.toBeNull();
		expect(hoverPopover.shadowRoot?.querySelector('[data-draft-hover-panel="true"]')).not.toBeNull();
		expect(hoverPopover.shadowRoot?.textContent ?? "").toContain("Loading preview...");

		await vi.advanceTimersByTimeAsync(120);
		hoverPopover = document.querySelector('[data-insta-draft-hover-popover="true"]') as HTMLDivElement | null;
		expect(hoverPopover?.shadowRoot?.textContent ?? "").toContain("Ready");
		expect(hoverPopover?.shadowRoot?.textContent ?? "").toContain("context preview: Build the toggle UI.");

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

	it("D2 hybrid: paints real-text Custom Highlights on contenteditable and suppresses mirror span underlines", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `<div id="editor" contenteditable="true">Build the toggle UI. Use React and TypeScript. Maybe later.</div>`;
		const editor = document.getElementById("editor") as HTMLElement;
		defineContentEditable(editor);

		const editorRect = {
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			width: 320,
			height: 160,
			right: 320,
			bottom: 160,
			toJSON: () => undefined,
		} as DOMRect;
		Object.defineProperty(editor, "getBoundingClientRect", {
			configurable: true,
			value: () => editorRect,
		});
		mockClientBox(editor, () => editorRect);

		const contentScript = await loadContentScript();

		// Swap the default "no highlights" stub for a working registry + constructor
		// AFTER module load — the content script feature-detects at render time.
		const highlightRegistry = new Map<string, unknown>();
		class FakeHighlight {
			public readonly ranges: Range[];
			constructor(...ranges: Range[]) {
				this.ranges = ranges;
			}
		}
		vi.stubGlobal("CSS", { highlights: highlightRegistry });
		vi.stubGlobal("Highlight", FakeHighlight);

		contentScript.main(createContentScriptCtx());

		editor.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);
		await flushMicrotasks();

		// Highlights registered per goal type, over the REAL text node.
		expect(highlightRegistry.size).toBeGreaterThan(0);
		for (const [name, highlight] of highlightRegistry) {
			expect(name).toMatch(/^insta-prompt-draft-/);
			const ranges = (highlight as InstanceType<typeof FakeHighlight>).ranges;
			expect(ranges.length).toBeGreaterThan(0);
			for (const range of ranges) {
				expect(range.startContainer).toBe(editor.firstChild);
				expect(range.collapsed).toBe(false);
			}
		}

		// The per-type ::highlight() stylesheet exists in the DOCUMENT tree scope.
		const highlightStyle = document.getElementById("insta-prompt-draft-highlight-style");
		expect(highlightStyle).not.toBeNull();
		expect(highlightStyle?.textContent ?? "").toContain("::highlight(insta-prompt-draft-context)");

		// Mirror spans still exist (hit-testing + state visuals) but carry no base
		// underline — the highlight layer owns it in this mode.
		const overlay = document.querySelector('[data-insta-draft-overlay="true"]') as HTMLDivElement | null;
		expect(overlay).not.toBeNull();
		const spans = Array.from(overlay?.shadowRoot?.querySelectorAll<HTMLSpanElement>("span[data-segment-index]") ?? []);
		expect(spans.length).toBeGreaterThanOrEqual(3);
		for (const span of spans) {
			expect(span.style.textDecorationLine).toBe("none");
		}

		// The host's own DOM is untouched (non-destructive guardrail).
		expect(editor.querySelector("span")).toBeNull();
		expect(editor.textContent).toBe("Build the toggle UI. Use React and TypeScript. Maybe later.");

		// Accepting clause 0 (Tab → Enter) removes its range from the highlight layer
		// and moves its underline onto the mirror span (accepted restyle).
		editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
		editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));

		const acceptedSpan = overlay?.shadowRoot?.querySelector<HTMLSpanElement>('span[data-segment-index="0"]');
		expect(acceptedSpan?.dataset.accepted).toBe("true");
		expect(acceptedSpan?.style.textDecorationLine).toBe("underline");
		const allRangesAfterAccept = Array.from(highlightRegistry.values()).flatMap(
			(highlight) => (highlight as InstanceType<typeof FakeHighlight>).ranges,
		);
		// Clause 0 starts at offset 0 — no remaining range may start there.
		expect(allRangesAfterAccept.every((range) => range.startOffset > 0)).toBe(true);

		// Retyping marks the draft stale: highlights are dropped and the dimmed
		// mirror takes the underlines back.
		editor.textContent = "Build the toggle UI. Use React and TypeScript. Maybe later with more.";
		editor.dispatchEvent(new Event("input", { bubbles: true }));

		expect(highlightRegistry.size).toBe(0);
		const respannedSpans = Array.from(overlay?.shadowRoot?.querySelectorAll<HTMLSpanElement>("span[data-segment-index]") ?? []);
		for (const span of respannedSpans) {
			if (span.dataset.accepted !== "true") {
				expect(span.style.textDecorationLine).toBe("underline");
			}
		}
	});

	it("D3: shows the keymap HUD with underlines, plays the coach mark once, and tears both down", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `<textarea id="notes"></textarea>`;
		const textarea = document.getElementById("notes") as HTMLTextAreaElement;
		textarea.value = "Build the toggle UI. Use React and TypeScript.";

		const rect = {
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			width: 320,
			height: 160,
			right: 320,
			bottom: 160,
			toJSON: () => undefined,
		} as DOMRect;
		Object.defineProperty(textarea, "getBoundingClientRect", {
			configurable: true,
			value: () => rect,
		});
		mockClientBox(textarea, () => rect);

		const contentScript = await loadContentScript();
		const localGetMock = getChromeStorageGetMock("local");
		const localSetMock = (chrome as unknown as { storage: { local: { set: ReturnType<typeof vi.fn> } } }).storage.local.set;
		// First run: onboarding flag absent.
		localGetMock.mockResolvedValue({});

		contentScript.main(createContentScriptCtx());

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);
		await flushMicrotasks();

		// HUD is up, with all four keymap rows and the six-entry color legend.
		const hud = document.querySelector('[data-insta-keymap-hud="true"]') as HTMLDivElement | null;
		expect(hud).not.toBeNull();
		expect(hud?.shadowRoot?.querySelectorAll("[data-hud-row]")).toHaveLength(5);
		expect(hud?.shadowRoot?.querySelectorAll("[data-hud-legend-entry]")).toHaveLength(6);
		expect(hud?.shadowRoot?.textContent ?? "").toContain("compile prompt");

		// Coach mark appeared (first run) and the seen flag was persisted.
		const coachMark = document.querySelector('[data-insta-coach-mark="true"]') as HTMLDivElement | null;
		expect(coachMark).not.toBeNull();
		expect(coachMark?.shadowRoot?.textContent ?? "").toContain("PromptCompiler found clauses");
		expect(localSetMock).toHaveBeenCalledWith({ "promptcompiler.onboarding.seen": true });

		// First Tab (entering review) dismisses the coach mark; the HUD stays.
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
		expect(document.querySelector('[data-insta-coach-mark="true"]')).toBeNull();
		expect(document.querySelector('[data-insta-keymap-hud="true"]')).not.toBeNull();

		// Clearing the draft (empty input) removes the HUD with the underlines.
		textarea.value = "";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);
		await flushMicrotasks();
		expect(document.querySelector('[data-insta-keymap-hud="true"]')).toBeNull();
	});

	it("D3: coach mark does not reappear once the onboarding flag is set", async () => {
		vi.useFakeTimers();

		document.body.innerHTML = `<textarea id="notes"></textarea>`;
		const textarea = document.getElementById("notes") as HTMLTextAreaElement;
		textarea.value = "Build the toggle UI.";

		const rect = {
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			width: 320,
			height: 160,
			right: 320,
			bottom: 160,
			toJSON: () => undefined,
		} as DOMRect;
		Object.defineProperty(textarea, "getBoundingClientRect", {
			configurable: true,
			value: () => rect,
		});
		mockClientBox(textarea, () => rect);

		const contentScript = await loadContentScript();
		getChromeStorageGetMock("local").mockResolvedValue({ "promptcompiler.onboarding.seen": true });

		contentScript.main(createContentScriptCtx());

		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(400);
		await flushMicrotasks();

		expect(document.querySelector('[data-insta-keymap-hud="true"]')).not.toBeNull();
		expect(document.querySelector('[data-insta-coach-mark="true"]')).toBeNull();
	});
});