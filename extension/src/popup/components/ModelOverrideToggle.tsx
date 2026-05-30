type Props = {
	forceGroq: boolean;
	onToggle: () => void;
};

export function ModelOverrideToggle({ forceGroq, onToggle }: Props) {
	return (
		<section className="mb-4">
			<label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">
				Model
			</label>
			<button
				type="button"
				onClick={onToggle}
				className={`w-full py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
					forceGroq
						? "bg-surface border-border text-text hover:bg-surface-hover"
						: "bg-brand border-brand text-white hover:bg-brand-hover"
				}`}
			>
				{forceGroq ? "Groq (forced)" : "Anthropic (pro)"}
			</button>
		</section>
	);
}
