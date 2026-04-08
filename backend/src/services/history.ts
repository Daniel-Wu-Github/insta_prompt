type HistoryRecord = {
	userId: string;
	rawInput: string;
	finalPrompt: string;
	mode: string;
	modelUsed: string;
};

export async function recordEnhancementHistory(_record: HistoryRecord): Promise<void> {
	// Intentionally no-op in Step 0; persistence wiring is deferred.
}

