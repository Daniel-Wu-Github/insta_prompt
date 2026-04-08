import type { StreamEvent } from "../../../shared/contracts";

const encoder = new TextEncoder();

export function formatSseEvent(event: StreamEvent): string {
  if (event.type === "token") {
    return `data: ${JSON.stringify({ type: "token", data: event.data })}\n\n`;
  }
  if (event.type === "error") {
    return `data: ${JSON.stringify({ type: "error", message: event.message })}\n\n`;
  }
  return `data: ${JSON.stringify({ type: "done" })}\n\n`;
}

export function streamFromEvents(events: StreamEvent[]): ReadableStream<Uint8Array> {
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= events.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(formatSseEvent(events[index])));
      index += 1;
    },
  });
}
