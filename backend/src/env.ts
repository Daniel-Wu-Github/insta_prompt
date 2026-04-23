import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const backendEnvPath = fileURLToPath(new URL("../.env", import.meta.url));

function parseEnvValue(rawValue: string): string {
	const trimmedValue = rawValue.trim();
	if (trimmedValue.length === 0) {
		return "";
	}

	const quote = trimmedValue[0];
	if ((quote === '"' || quote === "'" || quote === "`") && trimmedValue.endsWith(quote)) {
		return trimmedValue.slice(1, -1);
	}

	const inlineCommentIndex = trimmedValue.search(/\s+#/);
	return (inlineCommentIndex >= 0 ? trimmedValue.slice(0, inlineCommentIndex) : trimmedValue).trimEnd();
}

function loadEnvFile(envPath: string): void {
	if (!existsSync(envPath)) {
		return;
	}

	const envText = readFileSync(envPath, "utf8");
	for (const line of envText.split(/\r?\n/)) {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
			continue;
		}

		const normalizedLine = trimmedLine.startsWith("export ") ? trimmedLine.slice(7).trimStart() : trimmedLine;
		const equalsIndex = normalizedLine.indexOf("=");
		if (equalsIndex <= 0) {
			continue;
		}

		const key = normalizedLine.slice(0, equalsIndex).trim();
		const existingValue = process.env[key];
		if (key.length === 0 || (existingValue !== undefined && existingValue.trim().length > 0)) {
			continue;
		}

		const rawValue = normalizedLine.slice(equalsIndex + 1);
		process.env[key] = parseEnvValue(rawValue);
	}
}

loadEnvFile(backendEnvPath);
