// Hermetic mock of the PromptCompiler backend for the e2e fixture tier.
// The real deployment must never be in the loop here: live-network timing made
// the suite flaky (auth refresh against fly.dev with fake credentials would
// intermittently invalidate the seeded session and tear down rendering).
//
// Shapes mirror backend/src/routes:
//   POST /auth/token  → refreshed token JSON (same shape boundary.test.ts mocks)
//   POST /segment     → { sections: [{ text, goal_type }] } — text must appear
//                       verbatim in the sent prompt (content script re-anchors
//                       by indexOf); goal types cycle through the taxonomy.
//   POST /enhance|/bind → SSE with token/done events.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4174);

const GOAL_TYPES = ["context", "tech_stack", "constraint", "action", "output_format", "edge_case"];

function readBody(request) {
	return new Promise((resolve) => {
		let body = "";
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => resolve(body));
	});
}

function sendJson(response, status, payload) {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(payload));
}

createServer(async (request, response) => {
	const url = new URL(request.url ?? "/", "http://localhost");
	const body = await readBody(request);

	if (url.pathname === "/health") {
		sendJson(response, 200, { ok: true });
		return;
	}

	if (url.pathname === "/auth/token") {
		sendJson(response, 200, {
			token: "e2e-test-jwt",
			token_type: "bearer",
			expires_in: 3600,
			refresh_token: "e2e-test-refresh",
			user_id: "e2e-user",
			tier: "free",
		});
		return;
	}

	if (url.pathname === "/segment") {
		let text = "";
		try {
			const parsed = JSON.parse(body);
			text = Array.isArray(parsed?.segments) ? String(parsed.segments[0] ?? "") : "";
		} catch {
			// fall through with empty text
		}
		// Sentence-split the prompt and classify round-robin — deterministic,
		// verbatim substrings so the content script can re-anchor them.
		const sections = (text.match(/[^.!?\n]+[.!?]?/g) ?? [])
			.map((sentence) => sentence.trim())
			.filter((sentence) => sentence.length > 0)
			.map((sentence, index) => ({
				text: sentence,
				goal_type: GOAL_TYPES[index % GOAL_TYPES.length],
			}));
		sendJson(response, 200, { sections });
		return;
	}

	if (url.pathname === "/enhance" || url.pathname === "/bind") {
		response.writeHead(200, {
			"content-type": "text/event-stream",
			"cache-control": "no-store",
			connection: "keep-alive",
		});
		const payload = url.pathname === "/bind" ? "Compiled prompt (e2e mock)." : "Enhanced clause (e2e mock).";
		for (const word of payload.split(" ")) {
			response.write(`data: ${JSON.stringify({ token: `${word} ` })}\n\n`);
		}
		response.write("data: [DONE]\n\n");
		response.end();
		return;
	}

	sendJson(response, 404, { error: "not found" });
}).listen(port, "127.0.0.1", () => {
	console.log(`mock backend on http://127.0.0.1:${port}`);
});
