import type { Mode, Tier } from "../../../shared/contracts";

export type CallType = "segment" | "enhance" | "bind";

export type ModelConfig = {
	provider: "stub";
	model: "step0-placeholder";
	maxTokens: number;
};

export function selectModel(_tier: Tier, _mode: Mode, _callType: CallType): ModelConfig {
	return {
		provider: "stub",
		model: "step0-placeholder",
		maxTokens: 256,
	};
}

