import { getSupabaseClient } from "./supabase";

export type EnhancementHistoryRecord = {
	userId: string;
	projectId: string | null;
	rawInput: string;
	finalPrompt: string;
	mode: string;
	modelUsed: string;
	sectionCount: number;
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

export type AbuseSignalType = "burst_threshold_approached" | "burst_limit_exceeded";

export type AbuseSignalRecord = {
	signal: AbuseSignalType;
	userId: string;
	tier: string;
	route: string;
	limit: number;
	used: number;
	remaining: number;
	window_seconds: number;
	reset: number;
	retry_after: number;
	created_at: string;
};

type AbuseSignalCaptureOverride = (record: AbuseSignalRecord) => Promise<void>;

let abuseSignalCaptureOverrideForTests: AbuseSignalCaptureOverride | undefined;

export function __setAbuseSignalCaptureOverrideForTests(
	override: AbuseSignalCaptureOverride | undefined,
): void {
	abuseSignalCaptureOverrideForTests = override;
}

export function __resetAbuseSignalCaptureOverrideForTests(): void {
	abuseSignalCaptureOverrideForTests = undefined;
}

export async function captureEnhanceStreamMetadata(metadata: EnhanceStreamMetadata): Promise<void> {
	// Step 5.6 service boundary only. Step 6 persistence writes remain deferred.
	await Promise.resolve();
	console.info("[observability][enhance_stream]", JSON.stringify(metadata));
}

export async function captureRateLimitAbuseSignal(record: AbuseSignalRecord): Promise<void> {
	if (abuseSignalCaptureOverrideForTests) {
		await abuseSignalCaptureOverrideForTests(record);
		return;
	}

	await Promise.resolve();
	console.info("[observability][abuse_signal]", JSON.stringify(record));
}

export async function recordEnhancementHistory(record: EnhancementHistoryRecord): Promise<void> {
	const supabase = getSupabaseClient();
	if (!supabase) {
		throw new Error("Supabase service client unavailable");
	}

	const { error } = await supabase.from("enhancement_history").insert({
		user_id: record.userId,
		project_id: record.projectId,
		raw_input: record.rawInput,
		final_prompt: record.finalPrompt,
		mode: record.mode,
		model_used: record.modelUsed,
		section_count: record.sectionCount,
	});

	if (error) {
		throw error;
	}
}

