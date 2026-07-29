---
name: typescript-safety
description: "Use when writing TypeScript at message boundaries, runtime inputs, shared contracts, or any code that crosses the content-script/SW/backend trust boundary — to enforce Zod validation, discriminated unions, no-any rules, and sender verification."
user-invocable: false
---

# TypeScript Safety

## When to Use

Use this skill when:

- writing or reviewing message handlers at the SW port boundary
- defining or consuming types in `shared/contracts/`
- parsing runtime inputs from external sources (backend SSE, storage, page DOM)
- any code uses `as`, `any`, or untyped `JSON.parse`
- TypeScript errors are flagged by the post-edit verification hook

This skill is triggered by the `index.ts` error hotspot pattern. The 14+ recurring errors in `pending-improvements.md` trace largely to unguarded message shapes and implicit `any` in I/O paths.

## When Not to Use

Do not use this skill for:

- pure CSS or DOM geometry work with no runtime parsing
- documentation-only changes

## Files and Surfaces

Primary files:

- `extension/src/content/index.ts`
- `extension/src/background/index.ts`
- `shared/contracts/domain.ts`
- `shared/contracts/sse.ts`
- `backend/src/lib/schemas.ts`

---

## Core Rules

### Rule 1: Zod Schemas at Every Message Boundary

All messages received at the SW port handler must be validated with a Zod schema before dispatch. Use `safeParse` — never `parse` — inside message handlers.

```typescript
import { z } from 'zod';

const InboundMessageSchema = z.discriminatedUnion('verb', [
  z.object({ verb: z.literal('SEGMENT'), payload: SegmentPayloadSchema }),
  z.object({ verb: z.literal('ENHANCE'), payload: EnhancePayloadSchema }),
  z.object({ verb: z.literal('BIND'),    payload: BindPayloadSchema }),
  z.object({ verb: z.literal('CANCEL'),  payload: z.object({ tabId: z.number() }) }),
]);

port.onMessage.addListener((raw) => {
  const result = InboundMessageSchema.safeParse(raw);
  if (!result.success) {
    console.warn('[SW] invalid message shape', result.error.flatten());
    return; // reject without throwing
  }
  dispatch(result.data);
});
```

### Rule 2: Sender Verification Before Processing

Verify the message sender before acting on any port message. Reject messages from unknown origins silently.

```typescript
chrome.runtime.onConnect.addListener((port) => {
  // Only accept connections from this extension's own content scripts
  if (port.sender?.id !== chrome.runtime.id) {
    port.disconnect();
    return;
  }
  // proceed with message handling
});
```

### Rule 3: No `any` in Shared Contracts

All types in `shared/contracts/` must be fully typed. Ban `any` with a lint rule or a code comment policy.

```typescript
// WRONG
export type Section = { goal_type: any; text: any };

// CORRECT
export type GoalType = 'action' | 'tech_stack' | 'constraint' | 'output_format' | 'context' | 'edge_case';
export type Section = { goal_type: GoalType; text: string };
```

### Rule 4: Use `unknown` + Narrowing at All I/O Boundaries

When receiving data from `JSON.parse`, `chrome.storage`, or SSE events, type the input as `unknown` and narrow explicitly.

```typescript
// CORRECT
chrome.storage.sync.get('mode', (data: unknown) => {
  const result = ModeSchema.safeParse((data as Record<string, unknown>)?.mode);
  const mode = result.success ? result.data : 'balanced';
});

// WRONG
chrome.storage.sync.get('mode', (data: any) => {
  const mode = data.mode; // no validation
});
```

### Rule 5: Discriminated Unions for Message Verb Dispatch

Use TypeScript discriminated unions so the compiler enforces exhaustive handling of all verb types.

```typescript
type InboundMessage =
  | { verb: 'SEGMENT'; payload: SegmentPayload }
  | { verb: 'ENHANCE'; payload: EnhancePayload }
  | { verb: 'BIND';    payload: BindPayload }
  | { verb: 'CANCEL';  payload: { tabId: number } };

function dispatch(msg: InboundMessage) {
  switch (msg.verb) {
    case 'SEGMENT': return handleSegment(msg.payload);
    case 'ENHANCE': return handleEnhance(msg.payload);
    case 'BIND':    return handleBind(msg.payload);
    case 'CANCEL':  return handleCancel(msg.payload);
    // TypeScript will error here if a new verb is added without a handler
  }
}
```

### Rule 6: `tsconfig.json` Must Have `"strict": true`

The extension and backend packages must both enable strict mode. This catches implicit `any`, null dereferences, and unchecked optional access.

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

### Rule 7: Type SSE Events Explicitly

SSE `MessageEvent.data` is typed as `string` — parse it explicitly before use.

```typescript
evtSource.addEventListener('message', (e: MessageEvent<string>) => {
  if (e.data === '[DONE]') return finalize();
  const result = TokenChunkSchema.safeParse(JSON.parse(e.data));
  if (!result.success) return; // malformed token — skip silently
  appendGhostText(result.data.token);
});
```

### Rule 8: Never Cast with `as` to Skip Validation

Use `as` only for DOM type widening (`as HTMLTextAreaElement`) or when TypeScript inference is provably wrong. Never use `as` to suppress a type error at an I/O boundary.

```typescript
// ACCEPTABLE — DOM narrowing
const ta = document.getElementById('foo') as HTMLTextAreaElement;

// WRONG — bypasses runtime safety
const msg = rawMessage as BindPayload; // no validation
```

---

## Deliverables

- Zod schemas defined for all inbound message shapes
- `safeParse` used in all message handlers — no thrown validation errors
- Sender ID verified before processing any port connection
- No `any` in `shared/contracts/` files
- Discriminated union on `verb` field for the message router
- `"strict": true` confirmed in `tsconfig.json` for extension and backend packages
- All SSE event data parsed through Zod before use
