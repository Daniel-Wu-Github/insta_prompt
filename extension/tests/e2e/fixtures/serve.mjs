import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// MV3 content scripts don't run on file:// pages unless the user manually
// grants "Allow access to file URLs" (no CLI toggle) — serve fixtures over
// http instead so the extension's <all_urls> match applies normally.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4173;

const server = createServer(async (req, res) => {
	const filePath = path.join(__dirname, req.url === "/" ? "plain-textarea.html" : req.url ?? "");
	try {
		const body = await readFile(filePath);
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(body);
	} catch {
		res.writeHead(404);
		res.end("not found");
	}
});

server.listen(PORT, () => {
	console.log(`fixture server listening on http://127.0.0.1:${PORT}`);
});
