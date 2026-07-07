import { useState } from "react";

import type { PromptHistoryEntry } from "../../lib/prompt-history";

type Props = {
	entries: PromptHistoryEntry[];
	notice: string | null;
	onPin: (id: string, pinned: boolean) => void;
	onDelete: (id: string) => void;
};

function formatEntryDate(createdAt: number): string {
	const date = new Date(createdAt);
	const now = new Date();
	const sameDay = date.toDateString() === now.toDateString();
	return sameDay
		? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
		: date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function EntryRow({
	entry,
	copied,
	onCopy,
	onPin,
	onDelete,
}: {
	entry: PromptHistoryEntry;
	copied: boolean;
	onCopy: () => void;
	onPin: () => void;
	onDelete: () => void;
}) {
	return (
		<li className="bg-surface border border-border rounded-lg px-3 py-2">
			<p className="text-xs text-text truncate" title={entry.prompt}>
				{entry.prompt}
			</p>
			<div className="flex items-center justify-between mt-1.5">
				<span className="text-[10px] text-muted truncate max-w-[140px]">
					{entry.host || "unknown"} · {entry.mode} · {formatEntryDate(entry.createdAt)}
				</span>
				<span className="flex items-center gap-2 shrink-0">
					<button
						type="button"
						onClick={onCopy}
						className="text-[10px] text-muted hover:text-text transition-colors cursor-pointer bg-transparent border-none p-0"
					>
						{copied ? "Copied" : "Copy"}
					</button>
					<button
						type="button"
						onClick={onPin}
						title={entry.pinned ? "Unpin template" : "Pin as template"}
						className={`text-[11px] transition-colors cursor-pointer bg-transparent border-none p-0 ${
							entry.pinned ? "text-brand hover:text-brand-hover" : "text-muted hover:text-text"
						}`}
					>
						{entry.pinned ? "★" : "☆"}
					</button>
					<button
						type="button"
						onClick={onDelete}
						title="Delete"
						className="text-[11px] text-muted hover:text-error transition-colors cursor-pointer bg-transparent border-none p-0"
					>
						✕
					</button>
				</span>
			</div>
		</li>
	);
}

export function HistoryPanel({ entries, notice, onPin, onDelete }: Props) {
	const [query, setQuery] = useState("");
	const [copiedId, setCopiedId] = useState<string | null>(null);

	const normalizedQuery = query.trim().toLowerCase();
	const filtered = normalizedQuery
		? entries.filter(
			(entry) =>
				entry.prompt.toLowerCase().includes(normalizedQuery) ||
				entry.host.toLowerCase().includes(normalizedQuery),
		)
		: entries;

	const templates = filtered.filter((entry) => entry.pinned);
	const recent = filtered.filter((entry) => !entry.pinned);

	const handleCopy = (entry: PromptHistoryEntry): void => {
		void navigator.clipboard.writeText(entry.prompt).then(() => {
			setCopiedId(entry.id);
			window.setTimeout(() => {
				setCopiedId((current) => (current === entry.id ? null : current));
			}, 1500);
		});
	};

	return (
		<section className="mb-4">
			<label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">
				History &amp; templates
			</label>

			{entries.length === 0 ? (
				<p className="text-[11px] text-muted">
					Compiled prompts appear here after you commit them. Pin one to keep it as a template.
				</p>
			) : (
				<>
					<input
						type="search"
						placeholder="Search prompts…"
						value={query}
						onChange={(e) => { setQuery(e.target.value); }}
						className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-xs placeholder:text-muted focus:outline-none focus:border-brand transition-colors mb-2"
					/>

					{notice !== null && <p className="text-[11px] text-warning mb-2">{notice}</p>}

					<div className="max-h-56 overflow-y-auto pr-0.5">
						{templates.length > 0 && (
							<>
								<p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Templates</p>
								<ul className="flex flex-col gap-1.5 mb-2.5">
									{templates.map((entry) => (
										<EntryRow
											key={entry.id}
											entry={entry}
											copied={copiedId === entry.id}
											onCopy={() => { handleCopy(entry); }}
											onPin={() => { onPin(entry.id, false); }}
											onDelete={() => { onDelete(entry.id); }}
										/>
									))}
								</ul>
							</>
						)}

						{recent.length > 0 && (
							<>
								{templates.length > 0 && (
									<p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Recent</p>
								)}
								<ul className="flex flex-col gap-1.5">
									{recent.map((entry) => (
										<EntryRow
											key={entry.id}
											entry={entry}
											copied={copiedId === entry.id}
											onCopy={() => { handleCopy(entry); }}
											onPin={() => { onPin(entry.id, true); }}
											onDelete={() => { onDelete(entry.id); }}
										/>
									))}
								</ul>
							</>
						)}

						{filtered.length === 0 && (
							<p className="text-[11px] text-muted">No prompts match “{query.trim()}”.</p>
						)}
					</div>
				</>
			)}
		</section>
	);
}
