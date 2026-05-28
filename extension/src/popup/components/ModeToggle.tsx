type Mode = "efficiency" | "balanced" | "detailed";

type Props = {
	mode: Mode;
	onChange: (mode: Mode) => void;
};

const MODE_OPTIONS: { value: Mode; label: string }[] = [
	{ value: "efficiency", label: "Efficiency" },
	{ value: "balanced", label: "Balanced" },
	{ value: "detailed", label: "Detailed" },
];

export function ModeToggle({ mode, onChange }: Props) {
	return (
		<section className="mb-4">
			<label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">
				Mode
			</label>
			<div className="flex rounded-lg bg-surface border border-border overflow-hidden">
				{MODE_OPTIONS.map(({ value, label }) => (
					<button
						key={value}
						type="button"
						onClick={() => onChange(value)}
						className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer ${
							mode === value
								? "bg-brand text-white"
								: "text-muted hover:text-text hover:bg-surface-hover"
						}`}
					>
						{label}
					</button>
				))}
			</div>
		</section>
	);
}
