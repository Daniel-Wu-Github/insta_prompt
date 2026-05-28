type Props = {
	paused: boolean;
	onToggle: () => void;
};

export function PauseToggle({ paused, onToggle }: Props) {
	return (
		<section className="mb-4">
			<label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">
				Enhancements
			</label>
			<button
				type="button"
				onClick={onToggle}
				className={`w-full py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
					paused
						? "bg-surface border-border text-muted hover:text-text hover:bg-surface-hover"
						: "bg-brand border-brand text-white"
				}`}
			>
				{paused ? "Paused" : "Active"}
			</button>
		</section>
	);
}
