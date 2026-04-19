type HistoryRecord = {
	userId: string;
	rawInput: string;
	finalPrompt: string;
	mode: string;
	modelUsed: string;
};

export type EnhanceStreamMetadataEvent = "start" | "done" | "error" | "abort";

export type EnhanceStreamMetadata = {
	event: EnhanceStreamMetadataEvent;
	userId: string | null;
	tier: string;
	mode: string;
	goal_type: string;
	provider: string;
	model: string;
	duration_ms: number;
	error_message?: string;
	created_at: string;
};

export async function captureEnhanceStreamMetadata(metadata: EnhanceStreamMetadata): Promise<void> {
	// Step 5.6 service boundary only. Step 6 persistence writes remain deferred.
	await Promise.resolve();
	console.info("[observability][enhance_stream]", JSON.stringify(metadata));
}

export async function recordEnhancementHistory(_record: HistoryRecord): Promise<void> {
	// Intentionally no-op in Step 0; persistence wiring is deferred.
}

