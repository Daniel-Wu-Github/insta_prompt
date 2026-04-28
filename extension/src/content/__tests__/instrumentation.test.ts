// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ListenerRegistration = {
	target: EventTarget;
	type: string;
	listener: EventListenerOrEventListenerObject | null;
	options: boolean | AddEventListenerOptions | undefined;
};

type ChromeConnectHandle = {
	onMessage: { addListener: ReturnType<typeof vi.fn> };
	onDisconnect: { addListener: ReturnType<typeof vi.fn> };
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

function defineContentEditable(element: HTMLElement): void {
	Object.defineProperty(element, "isContentEditable", {
		configurable: true,
		value: true,
	});
}

function countListenerRegistrations(target: EventTarget, type: string): number {
	return listenerRegistrations.filter((registration) => registration.target === target && registration.type === type).length;
}

function normalizeLoggedText(value: unknown): string {
	return String(value)
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join("\n");
}

function installTestGlobals(): { connectMock: ReturnType<typeof vi.fn> } {
	const connectMock = vi.fn((): ChromeConnectHandle => {
		return {
			onMessage: { addListener: vi.fn() },
			onDisconnect: { addListener: vi.fn() },
		};
	});

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

	vi.stubGlobal("defineContentScript", (config: unknown) => config);
	vi.stubGlobal("chrome", { runtime: { connect: connectMock } });
	vi.stubGlobal("CSS", { highlights: undefined });
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
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

afterEach(() => {
	for (const observer of trackedObservers) {
		observer.disconnect();
	}

	trackedObservers = [];
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

		const debouncedLogs = consoleLogSpy.mock.calls.filter((call) => call[0] === "Debounced extracted text:\n");
		expect(debouncedLogs).toHaveLength(1);
		expect(normalizeLoggedText(debouncedLogs[0]?.[1])).toBe("First clause\nSecond clause\nThird clause");
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
});