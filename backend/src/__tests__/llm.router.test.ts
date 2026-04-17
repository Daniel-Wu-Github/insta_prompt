import { describe, expect, it } from "bun:test";

import type { Mode, Tier } from "../../../shared/contracts";

import { MODE_TOKEN_BUDGETS, selectModel, type CallType } from "../services/llm";

const MODES: Mode[] = ["efficiency", "balanced", "detailed"];
const TIERS: Tier[] = ["free", "pro", "byok"];
const CALL_TYPES: CallType[] = ["segment", "enhance", "bind"];
const GENERATION_CALL_TYPES: Exclude<CallType, "segment">[] = ["enhance", "bind"];

const EXPECTED_MODE_TOKENS: Record<Mode, number> = {
	efficiency: 150,
	balanced: 500,
	detailed: 1000,
};

function expectedModelForSupportedRoute(callType: CallType, tier: Tier, mode: Mode): {
	provider: string;
	model: string;
	maxTokens: number;
} {
	if (callType === "segment") {
		return {
			provider: "groq",
			model: "llama-3.1-8b-instant",
			maxTokens: 500,
		};
	}

	if (tier === "free") {
		return {
			provider: "groq",
			model: "llama-3.3-70b-versatile",
			maxTokens: EXPECTED_MODE_TOKENS[mode],
		};
	}

	if (tier === "pro") {
		return {
			provider: "anthropic",
			model: mode === "efficiency" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
			maxTokens: EXPECTED_MODE_TOKENS[mode],
		};
	}

	return {
		provider: "openai",
		model: "gpt-5-mini",
		maxTokens: EXPECTED_MODE_TOKENS[mode],
	};
}

describe("selectModel", () => {
	it("keeps exact mode token budget boundaries at 150/500/1000", () => {
		expect(MODE_TOKEN_BUDGETS).toEqual({
			efficiency: 150,
			balanced: 500,
			detailed: 1000,
		});
	});

	it("resolves full callType x tier x mode matrix deterministically for supported combinations", () => {
		for (const callType of CALL_TYPES) {
			for (const tier of TIERS) {
				for (const mode of MODES) {
					const selected = selectModel({
						callType,
						tier,
						mode,
						byokConfig: {
							preferredProvider: "openai",
							preferredModel: "gpt-5-mini",
						},
					});

					const expected = expectedModelForSupportedRoute(callType, tier, mode);
					expect(selected).toEqual(expected);
				}
			}
		}
	});

	it("pins /segment to the fast low-cost classifier path for every tier and mode", () => {
		for (const tier of TIERS) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType: "segment",
					tier,
					mode,
					byokConfig: {
						preferredProvider: "openai",
						preferredModel: "gpt-5-mini",
					},
				});

				expect(selected.provider).toBe("groq");
				expect(selected.model).toBe("llama-3.1-8b-instant");
				expect(selected.maxTokens).toBe(500);
			}
		}
	});

	it("keeps free-tier generation on Groq-only routes with exact mode budgets", () => {
		for (const callType of GENERATION_CALL_TYPES) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType,
					tier: "free",
					mode,
				});

				expect(selected.provider).toBe("groq");
				expect(selected.model).toBe("llama-3.3-70b-versatile");
				expect(selected.maxTokens).toBe(MODE_TOKEN_BUDGETS[mode]);
			}
		}
	});

	it("routes pro-tier generation by mode to Anthropic with exact mode budgets", () => {
		for (const callType of GENERATION_CALL_TYPES) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType,
					tier: "pro",
					mode,
				});

				expect(selected.provider).toBe("anthropic");
				expect(selected.model).toBe(
					mode === "efficiency" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
				);
				expect(selected.maxTokens).toBe(MODE_TOKEN_BUDGETS[mode]);
			}
		}
	});

	it("uses BYOK preferred provider/model for generation routes", () => {
		for (const callType of GENERATION_CALL_TYPES) {
			for (const mode of MODES) {
				const selected = selectModel({
					callType,
					tier: "byok",
					mode,
					byokConfig: {
						preferredProvider: "openai",
						preferredModel: "gpt-5-mini",
					},
				});

				expect(selected.provider).toBe("openai");
				expect(selected.model).toBe("gpt-5-mini");
				expect(selected.maxTokens).toBe(MODE_TOKEN_BUDGETS[mode]);
			}
		}
	});

	it("returns deterministic BYOK safe fallback when preferred model is missing", () => {
		const selected = selectModel({
			callType: "enhance",
			tier: "byok",
			mode: "balanced",
			byokConfig: {
				preferredProvider: "",
				preferredModel: "",
			},
		});

		expect(selected.provider).toBe("user");
		expect(selected.model).toBe("byok-config-missing");
		expect(selected.maxTokens).toBe(EXPECTED_MODE_TOKENS.balanced);
	});

	it("returns deterministic safe fallback on unknown unsupported route combinations", () => {
		const unsupportedCombos = [
			{
				callType: "unknown" as CallType,
				tier: "enterprise" as Tier,
				mode: "turbo" as Mode,
				expected: {
					provider: "groq",
					model: "llama-3.3-70b-versatile",
					maxTokens: EXPECTED_MODE_TOKENS.balanced,
				},
			},
			{
				callType: "enhance" as CallType,
				tier: "enterprise" as Tier,
				mode: "balanced" as Mode,
				expected: {
					provider: "groq",
					model: "llama-3.3-70b-versatile",
					maxTokens: EXPECTED_MODE_TOKENS.balanced,
				},
			},
			{
				callType: "bind" as CallType,
				tier: "pro" as Tier,
				mode: "turbo" as Mode,
				expected: {
					provider: "groq",
					model: "llama-3.3-70b-versatile",
					maxTokens: EXPECTED_MODE_TOKENS.balanced,
				},
			},
			{
				callType: "segment" as CallType,
				tier: "enterprise" as Tier,
				mode: "turbo" as Mode,
				expected: {
					provider: "groq",
					model: "llama-3.1-8b-instant",
					maxTokens: 500,
				},
			},
		] as const;

		for (const combo of unsupportedCombos) {
			const selected = selectModel({
				callType: combo.callType,
				tier: combo.tier,
				mode: combo.mode,
				byokConfig: null,
			});

			expect(selected).toEqual(combo.expected);
		}
	});
});