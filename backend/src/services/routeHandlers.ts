import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

import type { Tier } from "../../../shared/contracts";
import { readJsonBody, validationErrorResponse, zodValidationErrorResponse } from "../lib/http";
import { bindRequestSchema, enhanceRequestSchema, segmentRequestSchema, segmentResponseSchema } from "../lib/schemas";
import { parseWithSchema } from "../lib/validation";
import { fetchProjectContext } from "./context";
import {
	captureEnhanceStreamMetadata,
	recordEnhancementHistory,
	type EnhanceStreamMetadata,
	type EnhanceStreamMetadataEvent,
} from "./history";
import {
	canonicalizeBindSections,
	prepareBindServiceHandoff,
	prepareEnhanceServiceHandoff,
	selectModel,
	type ByokConfig,
} from "./llm";
import {
	createAnthropicStreamingAdapter,
	createGroqStreamingAdapter,
	toProviderErrorEvent,
	type ProviderErrorCode,
	type ProviderStreamErrorEvent,
	type ProviderStreamingAdapter,
} from "./providers";
import {
	classifySegmentsFromStreamingAdapter,
	normalizeIncomingSegments,
	normalizeSegmentClassificationIntermediate,
} from "./segment";

function initializeStreamingAdapter(provider: string): ProviderStreamingAdapter | null {
	if (provider === "groq") {
		return createGroqStreamingAdapter();
	}

	if (provider === "anthropic") {
		return createAnthropicStreamingAdapter();
	}

	return null;
}

const DETERMINISTIC_PROVIDER_ERROR_MESSAGES: Record<ProviderErrorCode, string> = {
	PROVIDER_TIMEOUT: "request timed out",
	PROVIDER_CONNECTION_RESET: "connection reset during request",
	PROVIDER_RATE_LIMITED: "rate limit exceeded",
	PROVIDER_BAD_GATEWAY: "upstream gateway error",
	PROVIDER_UNAVAILABLE: "service unavailable",
	PROVIDER_GATEWAY_TIMEOUT: "gateway timeout",
	PROVIDER_BAD_REQUEST: "bad request",
	PROVIDER_UNAUTHORIZED: "unauthorized",
	PROVIDER_FORBIDDEN: "forbidden",
	PROVIDER_NOT_FOUND: "resource not found",
	PROVIDER_INTERNAL_ERROR: "internal server error",
	PROVIDER_KEY_MISSING: "API key is missing",
	PROVIDER_ABORTED: "request was aborted",
	PROVIDER_INVALID_RESPONSE: "invalid streaming response",
	PROVIDER_NETWORK_ERROR: "network failure during provider request",
	PROVIDER_UNKNOWN_ERROR: "request failed",
};

function isAbortError(error: unknown): boolean {
	if (error instanceof DOMException) {
		return error.name === "AbortError";
	}

	if (error instanceof Error) {
		return error.name === "AbortError";
	}

	return false;
}

function toDeterministicProviderErrorMessage(errorEvent: ProviderStreamErrorEvent): string {
	const providerLabel = errorEvent.provider === "groq" ? "Groq" : "Anthropic";
	const mapped = DETERMINISTIC_PROVIDER_ERROR_MESSAGES[errorEvent.code] ?? "request failed";

	return `${providerLabel}: ${mapped}.`;
}

function captureEnhanceMetadataNonBlocking(metadata: EnhanceStreamMetadata): void {
	try {
		void captureEnhanceStreamMetadata(metadata).catch((error) => {
			console.warn("[observability][enhance_stream] capture failed", error);
		});
	} catch (error) {
		console.warn("[observability][enhance_stream] capture failed", error);
	}
}

function createEnhanceStreamMetadataCapture(
	base: Omit<EnhanceStreamMetadata, "event" | "duration_ms" | "error_message" | "created_at">,
): (event: EnhanceStreamMetadataEvent, errorMessage?: string) => void {
	const startedAtMs = Date.now();

	return (event, errorMessage) => {
		captureEnhanceMetadataNonBlocking({
			...base,
			event,
			duration_ms: event === "start" ? 0 : Date.now() - startedAtMs,
			...(errorMessage ? { error_message: errorMessage } : {}),
			created_at: new Date().toISOString(),
		});
	};
}

export async function segmentRouteHandler(c: Context) {
	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(segmentRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	const normalizedSegments = normalizeIncomingSegments(parsed.data.segments);
	if (normalizedSegments.length === 0) {
		return validationErrorResponse(c, "segments must include at least one non-empty string");
	}

	const model = selectModel({
		callType: "segment",
		tier: c.get("tier") as Tier,
		mode: parsed.data.mode,
	});

	const classifiedIntermediate = await classifySegmentsFromStreamingAdapter({
		segments: normalizedSegments,
		model,
		signal: c.req.raw.signal,
	});

	const response = normalizeSegmentClassificationIntermediate(classifiedIntermediate);

	const responseCheck = parseWithSchema(segmentResponseSchema, response);
	if (!responseCheck.ok) {
		return c.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Segment response failed schema validation",
				},
			},
			500,
		);
	}

	return c.json(responseCheck.data);
}

export async function enhanceRouteHandler(c: Context) {
	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(enhanceRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	const tier = c.get("tier") as Tier;
	const byokConfig: ByokConfig | null = null;
	const abortSignal = c.req.raw.signal;

	const projectContext = await fetchProjectContext(parsed.data.project_id);

	const model = selectModel({
		callType: "enhance",
		tier,
		mode: parsed.data.mode,
		byokConfig,
	});

	const handoff = prepareEnhanceServiceHandoff({
		route: {
			callType: "enhance",
			tier,
			mode: parsed.data.mode,
			byokConfig,
		},
		template: {
			goalType: parsed.data.section.goal_type,
			sectionText: parsed.data.section.text,
			mode: parsed.data.mode,
			siblings: parsed.data.siblings,
		},
	});

	const enhanceMetadataBase = {
		userId: (c.get("userId") as string | undefined) ?? null,
		tier,
		mode: parsed.data.mode,
		goal_type: parsed.data.section.goal_type,
		provider: handoff.model.provider,
		model: handoff.model.model,
	};

	const providerAdapter = initializeStreamingAdapter(model.provider);
	if (!providerAdapter) {
		return streamSSE(c, async (stream) => {
			const captureMetadata = createEnhanceStreamMetadataCapture(enhanceMetadataBase);
			captureMetadata("start");

			const unsupportedProviderMessage = "Enhance streaming provider is not supported.";
			captureMetadata("error", unsupportedProviderMessage);

			await stream.writeSSE({
				data: JSON.stringify({
					type: "error",
					message: unsupportedProviderMessage,
				}),
			});
		});
	}

	const userPrompt = projectContext ? `${handoff.prompt}\n\nProject context:\n${projectContext}` : handoff.prompt;

	return streamSSE(c, async (stream) => {
		const captureMetadata = createEnhanceStreamMetadataCapture(enhanceMetadataBase);
		let terminalEventSent = false;
		let terminalMetadataCaptured = false;
		let streamAborted = false;

		const captureTerminalMetadata = (event: Exclude<EnhanceStreamMetadataEvent, "start">, errorMessage?: string) => {
			if (terminalMetadataCaptured) {
				return;
			}

			terminalMetadataCaptured = true;
			captureMetadata(event, errorMessage);
		};

		captureMetadata("start");

		stream.onAbort(() => {
			streamAborted = true;
			captureTerminalMetadata("abort");
		});

		const writeErrorEvent = async (message: string) => {
			if (terminalEventSent || streamAborted || abortSignal.aborted) {
				return;
			}

			terminalEventSent = true;
			captureTerminalMetadata("error", message);
			await stream.writeSSE({
				data: JSON.stringify({
					type: "error",
					message,
				}),
			});
		};

		try {
			for await (const providerEvent of providerAdapter.stream({
				model: handoff.model.model,
				userPrompt,
				maxTokens: handoff.model.maxTokens,
				signal: abortSignal,
			})) {
				if (streamAborted || abortSignal.aborted) {
					captureTerminalMetadata("abort");
					return;
				}

				if (providerEvent.type === "token") {
					await stream.writeSSE({
						data: JSON.stringify({
							type: "token",
							data: providerEvent.content,
						}),
					});
					continue;
				}

				if (providerEvent.type === "error") {
					if (providerEvent.code === "PROVIDER_ABORTED") {
						captureTerminalMetadata("abort");
						return;
					}

					await writeErrorEvent(toDeterministicProviderErrorMessage(providerEvent));
					return;
				}

				if (!terminalEventSent) {
					terminalEventSent = true;
					await stream.writeSSE({
						data: JSON.stringify({
							type: "done",
						}),
					});
					captureTerminalMetadata("done");
				}

				return;
			}

			if (!terminalEventSent && !streamAborted && !abortSignal.aborted) {
				terminalEventSent = true;
				await stream.writeSSE({
					data: JSON.stringify({
						type: "done",
					}),
				});
				captureTerminalMetadata("done");
			}
		} catch (error) {
			if (isAbortError(error) || streamAborted || abortSignal.aborted) {
				captureTerminalMetadata("abort");
				return;
			}

			const mappedError = toProviderErrorEvent(providerAdapter.provider, error);
			await writeErrorEvent(toDeterministicProviderErrorMessage(mappedError));
		}
	});
}

export async function bindRouteHandler(c: Context) {
	const body = await readJsonBody(c);
	if (body === null) {
		return validationErrorResponse(c, "Invalid JSON body");
	}

	const parsed = parseWithSchema(bindRequestSchema, body);
	if (!parsed.ok) {
		return zodValidationErrorResponse(c, parsed.error);
	}

	const rawInput = JSON.stringify(parsed.data.sections);
	const sectionCount = parsed.data.sections.length;
	const tier = c.get("tier") as Tier;
	const userId = c.get("userId") as string | undefined;
	const byokConfig: ByokConfig | null = null;
	const abortSignal = c.req.raw.signal;
	const canonicalSections = canonicalizeBindSections(parsed.data.sections);

	if (!userId || userId.trim().length === 0) {
		return c.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Bind user context is missing.",
				},
			},
			500,
		);
	}

	if (canonicalSections.length === 0) {
		return validationErrorResponse(c, "sections must include at least one non-empty expansion");
	}

	const route = {
		callType: "bind" as const,
		tier,
		mode: parsed.data.mode,
		byokConfig,
	};

	const model = selectModel(route);
	const handoff = prepareBindServiceHandoff({
		route,
		template: {
			mode: parsed.data.mode,
			sections: canonicalSections,
		},
	});

	const providerAdapter = initializeStreamingAdapter(model.provider);
	if (!providerAdapter) {
		return c.json(
			{
				error: {
					code: "UNSUPPORTED_PROVIDER",
					message: "Bind streaming provider is not supported.",
				},
			},
			400,
		);
	}

	if (
		handoff.model.provider !== model.provider ||
		handoff.model.model !== model.model ||
		handoff.model.maxTokens !== model.maxTokens
	) {
		return c.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Bind handoff model mismatch.",
				},
			},
			500,
		);
	}

	if (handoff.prompt.trim().length === 0) {
		return c.json(
			{
				error: {
					code: "INTERNAL_ERROR",
					message: "Bind handoff prompt is empty.",
				},
			},
			500,
		);
	}

	const modelUsed = `${handoff.model.provider}:${handoff.model.model}`;

	return streamSSE(c, async (stream) => {
		let finalPrompt = "";
		let generationCompleted = false;
		let terminalEventSent = false;
		let streamAborted = false;

		stream.onAbort(() => {
			streamAborted = true;
		});

		const writeErrorEvent = async (message: string) => {
			if (terminalEventSent || streamAborted || abortSignal.aborted) {
				return;
			}

			terminalEventSent = true;
			await stream.writeSSE({
				data: JSON.stringify({
					type: "error",
					message,
				}),
			});
		};

		try {
			for await (const providerEvent of providerAdapter.stream({
				model: handoff.model.model,
				userPrompt: handoff.prompt,
				maxTokens: handoff.model.maxTokens,
				signal: abortSignal,
			})) {
				if (streamAborted || abortSignal.aborted) {
					return;
				}

				if (providerEvent.type === "token") {
					finalPrompt += providerEvent.content;
					await stream.writeSSE({
						data: JSON.stringify({
							type: "token",
							data: providerEvent.content,
						}),
					});
					continue;
				}

				if (providerEvent.type === "error") {
					if (providerEvent.code === "PROVIDER_ABORTED") {
						return;
					}

					await writeErrorEvent(toDeterministicProviderErrorMessage(providerEvent));
					return;
				}

				generationCompleted = true;
				break;
			}

			if (!generationCompleted && !streamAborted && !abortSignal.aborted) {
				generationCompleted = true;
			}

			if (!generationCompleted || streamAborted || abortSignal.aborted || terminalEventSent) {
				return;
			}

			try {
				await recordEnhancementHistory({
					userId,
					projectId: null,
					rawInput,
					finalPrompt,
					mode: parsed.data.mode,
					modelUsed,
					sectionCount,
				});
			} catch {
				if (streamAborted || abortSignal.aborted) {
					return;
				}

				await writeErrorEvent("Bind history persistence failed.");
				return;
			}

			if (c.req.raw.signal.aborted || streamAborted || terminalEventSent) {
				return;
			}

			terminalEventSent = true;
			await stream.writeSSE({
				data: JSON.stringify({
					type: "done",
				}),
			});
		} catch (error) {
			if (isAbortError(error) || streamAborted || abortSignal.aborted) {
				return;
			}

			const mappedError = toProviderErrorEvent(providerAdapter.provider, error);
			await writeErrorEvent(toDeterministicProviderErrorMessage(mappedError));
		}
	});
}