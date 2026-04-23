# LLM Routing

> Model selection logic, cost model, and system prompt structure.

Step scope note:

- This document describes Step 3+ implementation surfaces.
- Step 1 does not implement model routing or SSE orchestration.
- Step 2 enforces tier and rate-limit gates that feed into later routing behavior.

Canonical model identifiers in this doc are exact provider model IDs; descriptive family names are shorthand only.

---

## Routing Table

| Call type | Free tier | Pro — Efficiency | Pro — Balanced | Pro — Detailed | BYOK |
|---|---|---|---|---|---|
| `/segment` | Groq `llama-3.1-8b-instant` | Groq `llama-3.1-8b-instant` | Groq `llama-3.1-8b-instant` | Groq `llama-3.1-8b-instant` | Groq `llama-3.1-8b-instant` via user key |
| `/enhance` | Groq `llama-3.3-70b-versatile` | Anthropic `claude-haiku-4-5-20251001` | Anthropic `claude-sonnet-4-6` | Anthropic `claude-sonnet-4-6` | User-configured provider/model |
| `/enhance` | Groq `llama-3.3-70b-versatile` | Anthropic `claude-haiku-4-5-20251001` | Anthropic `claude-sonnet-4-6` | Anthropic `claude-sonnet-4-6` | User-configured provider/model |
| `/bind` | Groq `llama-3.3-70b-versatile` | Anthropic `claude-haiku-4-5-20251001` | Anthropic `claude-sonnet-4-6` | Anthropic `claude-sonnet-4-6` | User-configured provider/model |

The `/segment` call always uses the cheapest fast model — its job is JSON classification, not quality generation.

BYOK keeps the same route contract as managed tiers. It changes the credential source and user-configured provider/model selection, not the endpoint shape or SSE envelope.

---

## Cost Model

### Per-call estimates

| Model | Input (per 1K tokens) | Output (per 1K tokens) | Typical cost/call |
|---|---|---|---|
| Groq `llama-3.1-8b-instant` | ~$0.00005 | ~$0.00008 | ~$0.0001 |
| Groq `llama-3.3-70b-versatile` | ~$0.0006 | ~$0.0006 | ~$0.0008 |
| Anthropic `claude-haiku-4-5-20251001` | ~$0.0008 | ~$0.004 | ~$0.001 |
| Anthropic `claude-sonnet-4-6` | ~$0.003 | ~$0.015 | ~$0.004–0.008 |

### Free tier COGS
A typical free tier enhancement (1 segment call + 2 expand calls + 1 bind):
- `~$0.0001 + (2 × $0.0008) + $0.0008 = ~$0.0025/session`
- `~$0.0001 + (2 × $0.0008) + $0.0008 = ~$0.0025/session`
- 30 sessions/day/user = ~$0.075/user/day max
- 1,000 daily active free users = ~$75/day
  return { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: modeTokens(mode) };
- Well within manageable range; upgrade conversion keeps this profitable

---

## Model Router

```typescript
// backend/src/services/llm.ts

type ByokConfig = {
  preferredProvider: string;
  preferredModel: string;
};

type RouteKey = {
  tier: Tier;
  mode: Mode;
  callType: 'segment' | 'enhance' | 'bind';
  byokConfig?: ByokConfig | null;
};

function selectModel({ tier, mode, callType, byokConfig }: RouteKey): ModelConfig {
  // Segment always uses small fast model
  if (callType === 'segment') {
    return { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 500 };
  }

  if (tier === 'free') {
    return { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: modeTokens(mode) };
  }

  if (tier === 'byok') {
    if (!byokConfig?.preferredModel) {
      return { provider: 'user', model: 'byok-config-missing', maxTokens: modeTokens(mode) };
    }
    return { provider: 'user', model: byokConfig.preferredModel, maxTokens: modeTokens(mode) };
  }

  // Pro tier
  if (mode === 'efficiency') {
    return { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', maxTokens: 150 };
  }
  return { provider: 'anthropic', model: 'claude-sonnet-4-6', maxTokens: modeTokens(mode) };
}

function modeTokens(mode: Mode): number {
  return { efficiency: 150, balanced: 300, detailed: 600 }[mode];
}
```

The router remains pure: `byokConfig` is resolved upstream from authenticated profile context and injected into `selectModel`. The router must not perform network calls, DB lookups, or payload-hint inference.

### BYOK Contract

BYOK is a credential-source flag, not a different endpoint shape or prompt type.

- `/segment` stays on the Groq `llama-3.1-8b-instant` fast path even when the key is user-owned.
- `/enhance` and `/bind` use the user-configured provider/model and the same SSE envelope as managed tiers.
- Prompt templates stay provider-agnostic; BYOK must be handled in the router and adapter layers.
- `selectModel` accepts optional resolved `byokConfig` input (`preferredProvider`, `preferredModel`) and maps missing config to deterministic safe behavior.

### Adapter Output Contract

Provider adapters must emit normalized stream events as JavaScript objects through an async iterable interface. Route handlers own SSE framing and status finalization; adapters must not write raw JSON chunks or raw HTTP SSE strings directly.

```typescript
async function* providerStream(...): AsyncGenerator<StreamEvent> {
  yield { type: 'token', data: '...' };
  yield { type: 'done' };
}
```

Adapters must not emit raw HTTP SSE strings (`data: ...\n\n`). SSE serialization belongs in route handlers for Step 5/6 transport boundaries.

### Transient Failure Policy

Provider adapters use bounded exponential backoff with a 3-attempt cap, 100ms initial delay, doubling on each retry, and a 5s max delay cap.

Retryable failures are limited to request timeout, connection reset, HTTP 429, HTTP 502, HTTP 503, and HTTP 504.

Do not retry HTTP 400, 401, 403, 404, or 500. Groq and Anthropic adapters share this policy unless a later source-of-truth doc says otherwise.

---

## System Prompt Structure

System prompts live in `backend/src/services/prompts/`. Each `goal_type` has its own template, with mode-specific instructions appended.

### Base template structure

```typescript
// backend/src/services/prompts/action.ts
export function actionPrompt(mode: Mode, siblings: Section[]): string {
  const siblingContext = siblings.length > 0
    ? `\n\nRelated context from other clauses:\n${siblings.map(s => `- ${s.text}`).join('\n')}`
    : '';

  const modeInstructions = {
    efficiency: 'Be concise. 1 tight paragraph. Remove ambiguity, sharpen intent.',
    balanced: 'Structure with 2-3 clear sections. Include constraints and expected output shape.',
    detailed: 'Full XML prompt block. Include: task, constraints, tech context, expected output format, edge cases to handle.',
  }[mode];

  return `You are a prompt compiler. Your job is to take a casual action clause and expand it into a clear, structured AI prompt fragment.

The clause describes an ACTION — the main task to be performed.

${modeInstructions}${siblingContext}

Output only the expanded prompt fragment. No preamble, no meta-commentary.`;
}
```

### Canonical slot order in binding pass

```typescript
// backend/src/services/prompts/bind.ts
export function bindPrompt(mode: Mode): string {
  return `You are a prompt compiler performing a final assembly pass.

You will receive expanded prompt sections in canonical order:
1. context → 2. tech_stack → 3. constraints → 4. action → 5. output_format → 6. edge_cases

Your job:
- Stitch them into one coherent, structured prompt
- Remove redundancy between sections
- Ensure consistent tone throughout
- Add transitions where needed
- Output a single ${mode === 'detailed' ? 'XML-structured' : 'markdown'} prompt block

Output only the final prompt. No preamble.`;
}
```

---

## Streaming SSE Format

All streaming endpoints use the same SSE envelope:

```
data: {"type":"token","data":"<chunk>"}
data: {"type":"token","data":"<chunk>"}
data: {"type":"done"}
```

Error mid-stream:
```
data: {"type":"error","message":"rate limit exceeded"}
```

Once a streaming response has begun, HTTP status is immutable. If a failure occurs after the first frame is emitted, the backend must send the SSE `error` event and close the stream gracefully instead of returning a new HTTP status or JSON response.

The background service worker parses this format and forwards `token` events to the content script via Port. The content script appends each token to the ghost text overlay.