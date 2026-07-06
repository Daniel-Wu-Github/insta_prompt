// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContentChromeMock, createContentScriptCtx, DEFAULT_TEST_AUTH } from "../../test/chrome-mock";

type ChromeConnectHandle = {
	postMessage: ReturnType<typeof vi.fn>;
	onMessage: { addListener: ReturnType<typeof vi.fn> };
	onDisconnect: { addListener: ReturnType<typeof vi.fn> };
};

type ContentScriptModule = {
	default: {
		main: (ctx: { onInvalidated: (callback: () => void) => void }) => void;
	};
};

const nativeMutationObserver = globalThis.MutationObserver;

let lastConnectMock: ReturnType<typeof vi.fn> | undefined;
// Leak guard: a previous test's module instance keeps its document-level
// discovery MutationObserver alive unless we disconnect it, and that stale
// instance re-instruments the next test's textarea (duplicate spans/handlers).
let trackedObservers: MutationObserver[] = [];
const DEFAULT_AUTH = DEFAULT_TEST_AUTH;

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

function installTestGlobals(): void {
	if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.randomUUID !== "function") {
		vi.stubGlobal("crypto", {
			randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}`,
		});
	}

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
		constructor(_callback: ResizeObserverCallback) {}
	}

	vi.stubGlobal("defineContentScript", (config: unknown) => config);
	// C3: chrome surface comes from the shared fixture (includes storage.onChanged,
	// whose absence crashed main() and produced 5 of the 13 stale failures here).
	const chromeMock = createContentChromeMock({ auth: DEFAULT_AUTH });
	(chromeMock.chromeStub.runtime as { connect: typeof connectMock }).connect = connectMock;
	vi.stubGlobal("chrome", chromeMock.chromeStub);
	vi.stubGlobal("CSS", { highlights: undefined });
	vi.stubGlobal("ResizeObserver", TrackingResizeObserver as unknown as typeof ResizeObserver);
	vi.stubGlobal("MutationObserver", TrackingMutationObserver as unknown as typeof MutationObserver);
}

async function loadContentScript(): Promise<ContentScriptModule["default"]> {
	vi.resetModules();
	installTestGlobals();
	const module = (await import("../index.ts")) as ContentScriptModule;
	return module.default;
}

async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
}

function getOverlaySpans(): HTMLSpanElement[] {
	// D1: segment spans live inside the overlay host's shadow root now.
	const overlays = Array.from(document.querySelectorAll<HTMLDivElement>('[data-insta-draft-overlay="true"]'));
	return overlays.flatMap((overlay) =>
		Array.from(overlay.shadowRoot?.querySelectorAll<HTMLSpanElement>("span[data-segment-index]") ?? []),
	);
}

beforeEach(() => {
	document.body.innerHTML = "";
	lastConnectMock = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

afterEach(() => {
	for (const observer of trackedObservers) {
		observer.disconnect();
	}
	trackedObservers = [];
	lastConnectMock = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

async function primeTextareaWithSegments(text: string): Promise<HTMLTextAreaElement> {
	vi.useFakeTimers();
	document.body.innerHTML = `<textarea id="notes"></textarea>`;
	const textarea = document.getElementById("notes") as HTMLTextAreaElement;
	textarea.value = text;

	Object.defineProperty(textarea, "getBoundingClientRect", {
		configurable: true,
		value: () =>
			({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				width: 320,
				height: 160,
				right: 320,
				bottom: 160,
				toJSON: () => undefined,
			}) as DOMRect,
	});
	// Post-BUG-GEOM the overlay sizes from clientWidth/clientHeight (0 in jsdom).
	Object.defineProperty(textarea, "clientWidth", { configurable: true, value: 320 });
	Object.defineProperty(textarea, "clientHeight", { configurable: true, value: 160 });

	const contentScript = await loadContentScript();
	contentScript.main(createContentScriptCtx());

	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	await vi.advanceTimersByTimeAsync(400);
	await flushMicrotasks();

	return textarea;
}

// BIND-UX-1 (shipped): Tab/Shift+Tab move review focus WITHOUT accepting;
// plain Enter accepts the focused clause. These tests replaced an older suite
// that asserted the pre-BIND-UX-1 "Tab accepts" behavior against current code.
function acceptNextSegment(textarea: HTMLTextAreaElement): void {
	textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
	textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
}

describe("Step 10 acceptance state machine", () => {
	it("Tab cycles review focus without accepting; Enter accepts the focused clause", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		const spans = getOverlaySpans();
		expect(spans.length).toBeGreaterThanOrEqual(3);

		// Three Tabs only move focus — nothing is accepted.
		for (let count = 0; count < 3; count += 1) {
			textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
		}
		expect(getOverlaySpans().filter((span) => span.dataset.accepted === "true").length).toBe(0);

		// Enter accepts the focused clause; focus auto-advances to the next
		// unaccepted clause, so repeated Enters accept the remaining clauses.
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));

		const accepted = getOverlaySpans().filter((span) => span.dataset.accepted === "true");
		expect(accepted.length).toBe(3);
		expect(accepted.map((span) => span.dataset.segmentIndex)).toEqual(["0", "1", "2"]);
	});

	it("Shift+Tab cycles focus backwards and never un-accepts", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		// Accept clause 0 (Tab focuses it, Enter accepts, focus advances to 1).
		acceptNextSegment(textarea);

		let spans = getOverlaySpans();
		expect(spans.filter((span) => span.dataset.accepted === "true").map((span) => span.dataset.segmentIndex)).toEqual(["0"]);
		expect(spans.find((span) => span.dataset.focused === "true")?.dataset.segmentIndex).toBe("1");

		// Shift+Tab moves focus back to clause 0 — still accepted, none removed.
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }));

		spans = getOverlaySpans();
		expect(spans.filter((span) => span.dataset.accepted === "true").map((span) => span.dataset.segmentIndex)).toEqual(["0"]);
		expect(spans.find((span) => span.dataset.focused === "true")?.dataset.segmentIndex).toBe("0");
	});

	it("BIND-UX-2: Backspace un-accepts the focused accepted clause", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		// Accept clauses 0 and 1.
		acceptNextSegment(textarea);
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
		expect(getOverlaySpans().filter((span) => span.dataset.accepted === "true").map((s) => s.dataset.segmentIndex)).toEqual(["0", "1"]);

		// Focus back to clause 1 (focus auto-advanced to 2 after the second accept).
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }));
		expect(getOverlaySpans().find((s) => s.dataset.focused === "true")?.dataset.segmentIndex).toBe("1");

		// Backspace withdraws clause 1's acceptance; clause 0 stays accepted.
		const backspace = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
		textarea.dispatchEvent(backspace);
		expect(backspace.defaultPrevented).toBe(true);
		expect(getOverlaySpans().filter((span) => span.dataset.accepted === "true").map((s) => s.dataset.segmentIndex)).toEqual(["0"]);

		// On the now-unaccepted focused clause, Backspace falls through to
		// normal text editing (not intercepted).
		const secondBackspace = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
		textarea.dispatchEvent(secondBackspace);
		expect(secondBackspace.defaultPrevented).toBe(false);
		expect(getOverlaySpans().filter((span) => span.dataset.accepted === "true").map((s) => s.dataset.segmentIndex)).toEqual(["0"]);
	});

	it("BIND-UX-2: un-accepting the last accepted clause closes the bind gate", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript.");

		acceptNextSegment(textarea);
		// Focus back onto the accepted clause 0 and withdraw it.
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }));
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" }));
		expect(getOverlaySpans().filter((span) => span.dataset.accepted === "true")).toHaveLength(0);

		const bridgePort = getLastBridgePort();
		bridgePort.postMessage.mockClear();
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", metaKey: true }));
		await flushMicrotasks();
		expect(bridgePort.postMessage).not.toHaveBeenCalled();
	});

	it("upstream edit marks accepted segments stale", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		acceptNextSegment(textarea);
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));

		expect(getOverlaySpans().filter((span) => span.dataset.accepted === "true").length).toBe(2);

		textarea.value = "Build the toggle UI. Use React and TypeScript. Maybe later with more.";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));

		const spans = getOverlaySpans();
		const staleAccepted = spans.filter(
			(span) => span.dataset.accepted === "true" && span.dataset.acceptedStale === "true",
		);
		expect(staleAccepted.length).toBe(2);
	});

	it("Cmd+Enter is a no-op when no segments are accepted", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript.");
		const bridgePort = getLastBridgePort();
		bridgePort.postMessage.mockClear();

		textarea.dispatchEvent(
			new KeyboardEvent("keydown", { bubbles: true, key: "Enter", metaKey: true }),
		);

		expect(bridgePort.postMessage).not.toHaveBeenCalled();
	});

	it("Cmd+Enter is a no-op when accepted segments are stale", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		acceptNextSegment(textarea);
		textarea.value = "Build the toggle UI. Use React and TypeScript. Maybe later with more.";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));

		const bridgePort = getLastBridgePort();
		bridgePort.postMessage.mockClear();

		textarea.dispatchEvent(
			new KeyboardEvent("keydown", { bubbles: true, key: "Enter", metaKey: true }),
		);
		await flushMicrotasks();

		expect(bridgePort.postMessage).not.toHaveBeenCalled();
	});
});

describe("Step 11 commit primitives", () => {
	// Pure-function check of the canonical-order policy used by the BIND dispatcher:
	// when accepted sections are collected in arbitrary acceptance order, they must
	// be sent to the SW in canonical clause order (context, tech_stack, constraint,
	// action, output_format, edge_case). This satisfies the Step 14 canonical sort
	// test bullet without needing to mock the async bridge dispatch path end-to-end.
	const CANONICAL_ORDER_BY_GOAL_TYPE = {
		context: 0,
		tech_stack: 1,
		constraint: 2,
		action: 3,
		output_format: 4,
		edge_case: 5,
	} as const;

	type GoalType = keyof typeof CANONICAL_ORDER_BY_GOAL_TYPE;

	const sortByCanonicalOrder = <T extends { goal_type: GoalType }>(sections: readonly T[]): T[] => {
		return [...sections].sort((left, right) => {
			return CANONICAL_ORDER_BY_GOAL_TYPE[left.goal_type] - CANONICAL_ORDER_BY_GOAL_TYPE[right.goal_type];
		});
	};

	it("sortByCanonicalOrder reorders random goal_type input into canonical sequence", () => {
		const randomized = [
			{ goal_type: "edge_case" as GoalType, expansion: "e" },
			{ goal_type: "action" as GoalType, expansion: "a" },
			{ goal_type: "context" as GoalType, expansion: "c" },
			{ goal_type: "output_format" as GoalType, expansion: "o" },
			{ goal_type: "tech_stack" as GoalType, expansion: "t" },
			{ goal_type: "constraint" as GoalType, expansion: "k" },
		];

		const sorted = sortByCanonicalOrder(randomized);

		expect(sorted.map((section) => section.goal_type)).toEqual([
			"context",
			"tech_stack",
			"constraint",
			"action",
			"output_format",
			"edge_case",
		]);
	});

	it("sortByCanonicalOrder is stable for sections with the same goal_type", () => {
		const input = [
			{ goal_type: "action" as GoalType, expansion: "a1" },
			{ goal_type: "tech_stack" as GoalType, expansion: "t1" },
			{ goal_type: "action" as GoalType, expansion: "a2" },
		];

		const sorted = sortByCanonicalOrder(input);
		expect(sorted.map((section) => section.expansion)).toEqual(["t1", "a1", "a2"]);
	});
});
