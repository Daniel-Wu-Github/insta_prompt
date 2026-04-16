import type { Mode, Tier } from "../../../shared/contracts";

export * from "./providers";

export type CallType = "segment" | "enhance" | "bind";

export type ByokConfig = {
	preferredProvider?: string | null;
	preferredModel?: string | null;
};

export type RouteKey = {
	callType: CallType;
	tier: Tier;
	mode: Mode;
	byokConfig?: ByokConfig | null;
};

export type ModelProvider = "groq" | "anthropic" | "user" | (string & {});

export type ModelConfig = {
	provider: ModelProvider;
	model: string;
	maxTokens: number;
};

export const MODE_TOKEN_BUDGETS: Record<Mode, number> = {
	efficiency: 150,
	balanced: 500,
	detailed: 1000,
};

const SEGMENT_CLASSIFIER_MODEL: ModelConfig = {
	provider: "groq",
	model: "llama-3.1-8b-instant",
	maxTokens: 500,
};

const FREE_GENERATION_MODEL = {
	provider: "groq" as const,
	model: "llama-3.3-70b-versatile",
};

const PRO_GENERATION_MODELS: Partial<Record<Mode, Omit<ModelConfig, "maxTokens">>> = {
	efficiency: {
		provider: "anthropic",
		model: "claude-haiku-4-5-20251001",
	},
	balanced: {
		provider: "anthropic",
		model: "claude-sonnet-4-6",
	},
	detailed: {
		provider: "anthropic",
		model: "claude-sonnet-4-6",
	},
};

const SAFE_FALLBACK_MODEL: ModelConfig = {
	provider: FREE_GENERATION_MODEL.provider,
	model: FREE_GENERATION_MODEL.model,
	maxTokens: MODE_TOKEN_BUDGETS.balanced,
};

function modeTokens(mode: Mode | string): number {
	switch (mode) {
		case "efficiency":
		case "balanced":
		case "detailed":
			return MODE_TOKEN_BUDGETS[mode];
		default:
			return MODE_TOKEN_BUDGETS.balanced;
	}
}

function resolveByokProvider(byokConfig?: ByokConfig | null): ModelProvider {
	const preferredProvider = byokConfig?.preferredProvider?.trim();
	return preferredProvider && preferredProvider.length > 0 ? preferredProvider : "user";
}

function resolveByokModel(byokConfig?: ByokConfig | null): string {
	const preferredModel = byokConfig?.preferredModel?.trim();
	return preferredModel && preferredModel.length > 0 ? preferredModel : "byok-config-missing";
}

function isGenerationCallType(callType: CallType | string): callType is Exclude<CallType, "segment"> {
	return callType === "enhance" || callType === "bind";
}

export function selectModel({ callType, tier, mode, byokConfig }: RouteKey): ModelConfig {
	if (callType === "segment") {
		return SEGMENT_CLASSIFIER_MODEL;
	}

	if (!isGenerationCallType(callType)) {
		return SAFE_FALLBACK_MODEL;
	}

	if (tier === "free") {
		return {
			provider: FREE_GENERATION_MODEL.provider,
			model: FREE_GENERATION_MODEL.model,
			maxTokens: modeTokens(mode),
		};
	}

	if (tier === "pro") {
		const proModel = PRO_GENERATION_MODELS[mode];
		if (!proModel) {
			return SAFE_FALLBACK_MODEL;
		}

		return {
			provider: proModel.provider,
			model: proModel.model,
			maxTokens: modeTokens(mode),
		};
	}

	if (tier === "byok") {
		return {
			provider: resolveByokProvider(byokConfig),
			model: resolveByokModel(byokConfig),
			maxTokens: modeTokens(mode),
		};
	}

	return SAFE_FALLBACK_MODEL;
}

