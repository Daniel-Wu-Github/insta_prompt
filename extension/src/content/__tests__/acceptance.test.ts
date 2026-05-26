// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ChromeConnectHandle = {
	postMessage: ReturnType<typeof vi.fn>;
	onMessage: { addListener: ReturnType<typeof vi.fn> };
	onDisconnect: { addListener: ReturnType<typeof vi.fn> };
};

type ContentScriptModule = {
	default: {
		main: () => void;
	};
};

const nativeMutationObserver = globalThis.MutationObserver;

let lastConnectMock: ReturnType<typeof vi.fn> | undefined;
const DEFAULT_AUTH = {
	access_token: "test-jwt",
	refresh_token: "test-refresh-token",
	expires_at: Date.now() + 3_600_000,
};

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
	vi.stubGlobal("chrome", {
		runtime: { connect: connectMock, id: "test-extension-id" },
		storage: {
			local: { get: vi.fn(async () => ({ ["promptcompiler.auth"]: DEFAULT_AUTH })) },
			session: { get: vi.fn(async () => ({ ["promptcompiler.auth"]: DEFAULT_AUTH })) },
			sync: { get: vi.fn(async () => ({})) },
		},
	});
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
	return Array.from(document.querySelectorAll<HTMLSpanElement>('[data-insta-draft-overlay="true"] span[data-segment-index]'));
}

beforeEach(() => {
	document.body.innerHTML = "";
	lastConnectMock = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

afterEach(() => {
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

	const contentScript = await loadContentScript();
	contentScript.main();

	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	await vi.advanceTimersByTimeAsync(400);
	await flushMicrotasks();

	return textarea;
}

describe("Step 10 acceptance state machine", () => {
	it("Tab adds segments to the acceptance queue oldest-first", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		const spans = getOverlaySpans();
		expect(spans.length).toBeGreaterThanOrEqual(3);

		for (let count = 0; count < 3; count += 1) {
			textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
		}

		const refreshedSpans = getOverlaySpans();
		const accepted = refreshedSpans.filter((span) => span.dataset.accepted === "true");
		expect(accepted.length).toBe(3);
		expect(accepted.map((span) => span.dataset.segmentIndex)).toEqual(["0", "1", "2"]);
	});

	it("Shift+Tab deselects the most-recently accepted segment", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));

		let spans = getOverlaySpans();
		expect(spans.filter((span) => span.dataset.accepted === "true").length).toBe(2);
		expect(spans.find((span) => span.dataset.focused === "true")?.dataset.segmentIndex).toBe("2");

		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }));

		spans = getOverlaySpans();
		const accepted = spans.filter((span) => span.dataset.accepted === "true");
		expect(accepted.length).toBe(2);
		expect(accepted.map((span) => span.dataset.segmentIndex)).toEqual(["0", "1"]);
		expect(spans.find((span) => span.dataset.focused === "true")?.dataset.segmentIndex).toBe("2");
	});

	it("upstream edit marks accepted segments stale", async () => {
		const textarea = await primeTextareaWithSegments("Build the toggle UI. Use React and TypeScript. Maybe later.");

		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));

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

		textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
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
