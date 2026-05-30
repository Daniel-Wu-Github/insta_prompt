import type { ClauseOrdering } from "../hooks/useClauseOrdering";

type Props = {
	ordering: ClauseOrdering;
	onChange: (next: ClauseOrdering) => void;
};

const OPTIONS: ReadonlyArray<{ value: ClauseOrdering; label: string }> = [
	{ value: "entry", label: "Entry" },
	{ value: "canonical", label: "Canonical" },
];

export function ClauseOrderingToggle({ ordering, onChange }: Props) {
	return (
		<section className="mb-4">
			<label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">
				Clause numbering
			</label>
			<div className="grid grid-cols-2 gap-1.5">
				{OPTIONS.map((option) => {
					const active = ordering === option.value;
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => { onChange(option.value); }}
							className={`py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
								active
									? "bg-brand border-brand text-white"
									: "bg-surface border-border text-muted hover:text-text hover:bg-surface-hover"
							}`}
						>
							{option.label}
						</button>
					);
				})}
			</div>
			<p className="text-[11px] text-muted mt-1.5">
				{ordering === "entry"
					? "Numbered by position in your text."
					: "Numbered by final compiled order."}
			</p>
		</section>
	);
}
