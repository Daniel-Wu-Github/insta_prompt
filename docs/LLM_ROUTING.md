# LLM Routing

> Model selection logic, cost model, and system prompt structure.

---

## Routing Table

| Call type | Free tier | Pro — Efficiency | Pro — Balanced | Pro — Detailed | BYOK |
|---|---|---|---|---|---|
| `/segment` | Groq Llama 3.1 8B | Groq Llama 3.1 8B | Groq Llama 3.1 8B | Groq Llama 3.1 8B | Groq (user key) |
| `/enhance` | Groq Llama 3.3 70B | Claude Haiku 3.5 | Claude Sonnet | Claude Sonnet | User's model |
| `/bind` | Groq Llama 3.3 70B | Claude Haiku 3.5 | Claude Sonnet | Claude Sonnet | User's model |

The `/segment` call always uses the cheapest fast model — its job is JSON classification, not quality generation.

---

## Cost Model

### Per-call estimates

| Model | Input (per 1K tokens) | Output (per 1K tokens) | Typical cost/call |
|---|---|---|---|
| Groq Llama 3.1 8B | ~$0.00005 | ~$0.00008 | ~$0.0001 |
| Groq Llama 3.3 70B | ~$0.0006 | ~$0.0006 | ~$0.0008 |
| Claude Haiku 3.5 | ~$0.0008 | ~$0.004 | ~$0.001 |
| Claude Sonnet | ~$0.003 | ~$0.015 | ~$0.004–0.008 |

### Free tier COGS
A typical free tier enhancement (1 segment call + 2 expand calls + 1 bind):
- `~$0.0001 + (2 × $0.0008) + $0.0008 = ~$0.0025/session`
- 30 sessions/day/user = ~$0.075/user/day max
- 1,000 daily active free users = ~$75/day
- Well within manageable range; upgrade conversion keeps this profitable

---

## Model Router

```typescript
// backend/src/services/llm.ts

type RouteKey = { tier: Tier; mode: Mode; callType: 'segment' | 'enhance' | 'bind' };

function selectModel({ tier, mode, callType }: RouteKey): ModelConfig {
  // Segment always uses small fast model
  if (callType === 'segment') {
    return { provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 500 };
  }

  if (tier === 'free') {
    return { provider: 'groq', model: 'llama-3.3-70b-versatile', maxTokens: modeTokens(mode) };
  }

  if (tier === 'byok') {
    return { provider: 'user', model: 'user-configured', maxTokens: modeTokens(mode) };
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

The background service worker parses this format and forwards `token` events to the content script via Port. The content script appends each token to the ghost text overlay.