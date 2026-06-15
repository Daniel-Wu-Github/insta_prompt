/**
 * Transport contract (Track C2). The single seam every surface uses to reach the
 * proxy backend. NO surface ever calls a third-party LLM provider directly — the
 * proxy-only invariant holds on every platform (plan R-PLAT-1). All methods are
 * abortable; streaming methods deliver tokens via callbacks. Pure types.
 */
import type { GoalType } from "../../../shared/contracts";

export interface SegmentedSection {
	id: string;
	text: string;
	goal_type: GoalType;
	canonical_order: number;
	depends_on: string[];
}

export interface SegmentResult {
	sections: SegmentedSection[];
}

export interface StreamHandlers {
	onToken: (token: string) => void;
	onDone?: () => void;
	onError?: (message: string) => void;
	signal?: AbortSignal;
}

/**
 * Implemented by each platform's transport layer (the extension's background port
 * bridge today; a fetch/SSE client in the web/IDE adapters). Core depends only on
 * this interface, never on chrome.* or fetch directly.
 */
export interface TransportClient {
	segment(text: string, opts: { mode: string; signal?: AbortSignal }): Promise<SegmentResult>;
	enhance(args: { sectionId: string } & StreamHandlers): Promise<void>;
	bind(args: { sectionIds: string[] } & StreamHandlers): Promise<void>;
}
