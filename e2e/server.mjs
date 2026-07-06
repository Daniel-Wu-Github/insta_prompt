// Tiny static server for the fixture pages — no deps, fully deterministic.
// Serves e2e/fixtures/** at http://127.0.0.1:4173/.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");
const port = Number(process.env.PORT ?? 4173);

const contentTypes = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".woff2": "font/woff2",
};

createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? "/", "http://localhost");
		let pathname = decodeURIComponent(url.pathname);
		if (pathname.endsWith("/")) {
			pathname += "index.html";
		}
		const filePath = normalize(join(root, pathname));
		if (!filePath.startsWith(root)) {
			response.writeHead(403).end("forbidden");
			return;
		}
		const body = await readFile(filePath);
		response.writeHead(200, {
			"content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
			"cache-control": "no-store",
		});
		response.end(body);
	} catch {
		response.writeHead(404).end("not found");
	}
}).listen(port, "127.0.0.1", () => {
	console.log(`fixture server on http://127.0.0.1:${port}`);
});
