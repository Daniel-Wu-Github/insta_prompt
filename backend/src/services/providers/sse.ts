export type ParsedSseEvent = {
	event: string;
	data: string;
};

const BLOCK_SEPARATOR_RE = /\r?\n\r?\n/;
const LINE_SEPARATOR_RE = /\r?\n/;

function parseSseBlock(block: string): ParsedSseEvent | null {
	const lines = block.split(LINE_SEPARATOR_RE);
	let eventName = "message";
	const dataLines: string[] = [];

	for (const line of lines) {
		if (line.length === 0 || line.startsWith(":")) {
			continue;
		}

		if (line.startsWith("event:")) {
			eventName = line.slice("event:".length).trim();
			continue;
		}

		if (line.startsWith("data:")) {
			dataLines.push(line.slice("data:".length).trimStart());
		}
	}

	if (dataLines.length === 0) {
		return null;
	}

	return {
		event: eventName,
		data: dataLines.join("\n"),
	};
}

export async function* parseSseEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<ParsedSseEvent> {
	const decoder = new TextDecoder();
	let buffer = "";
	const reader = stream.getReader();

	try {
		for (;;) {
			const chunkResult = await reader.read();
			if (chunkResult.done) {
				break;
			}

			buffer += decoder.decode(chunkResult.value, { stream: true });

			for (;;) {
				const separatorMatch = buffer.match(BLOCK_SEPARATOR_RE);
				if (!separatorMatch || separatorMatch.index === undefined) {
					break;
				}

				const block = buffer.slice(0, separatorMatch.index);
				buffer = buffer.slice(separatorMatch.index + separatorMatch[0].length);

				const parsed = parseSseBlock(block);
				if (parsed) {
					yield parsed;
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	buffer += decoder.decode();
	if (buffer.trim().length === 0) {
		return;
	}

	const trailing = parseSseBlock(buffer);
	if (trailing) {
		yield trailing;
	}
}