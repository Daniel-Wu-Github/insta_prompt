/**
 * Platform adapter contracts (Track C2). Core is generic over these: a platform
 * injects an InputSource + RenderTarget + TransportClient and drives the same
 * segment→classify→expand→bind→commit state machine. Core NEVER imports a
 * platform (plan R-ARCH-2). Pure types — zero runtime, zero risk.
 */
import type { GoalType } from "../../../shared/contracts";

export interface TextRange {
	/** UTF-16 code-unit offsets into the surface's plain text. */
	start: number;
	end: number;
}

/** Section lifecycle visual state (mirrors design-token `sectionState`). */
export type SectionVisualState = "ready" | "focused" | "accepted" | "stale" | "acceptedStale";

export interface UnderlineRange extends TextRange {
	goalType: GoalType;
	state: SectionVisualState;
}

export interface Anchor {
	/** Viewport coordinates of the anchor point (e.g. cursor or clause start). */
	x: number;
	y: number;
}

/**
 * A platform's editable text surface. Core READS from it and subscribes to change
 * and geometry events; it does not know whether it is a textarea, ProseMirror,
 * CodeMirror, or a VS Code document.
 */
export interface InputSource {
	getText(): string;
	getSelection(): TextRange | null;
	/** Subscribe to text changes; returns an unsubscribe fn. */
	onChange(listener: () => void): () => void;
	/** Subscribe to scroll/resize/layout changes; returns an unsubscribe fn. */
	onGeometryChange(listener: () => void): () => void;
}

/**
 * A platform's renderer. Core asks it to PRESENT compiler decisions; the impl is
 * platform-specific (DOM overlay, editor decoration ranges, TUI styling, native).
 * Non-destructive: nothing mutates the user's text until commitText (plan S-INT-1).
 */
export interface RenderTarget {
	drawUnderlines(ranges: UnderlineRange[]): void;
	clearUnderlines(): void;
	showPopover(anchor: Anchor, content: string): void;
	hidePopover(): void;
	/** Append a streamed ghost-text chunk to the bind preview. */
	streamGhostText(chunk: string): void;
	/** The single destructive step: replace the surface text with the compiled output. */
	commitText(text: string): void;
}
