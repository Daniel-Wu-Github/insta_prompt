type Props = {
	projectId: string | null;
	onChange: (projectId: string | null) => void;
};

export function ProjectSelector({ projectId, onChange }: Props) {
	return (
		<section className="mb-4">
			<label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">
				Project <span className="normal-case text-[10px]">(optional)</span>
			</label>
			<input
				type="text"
				value={projectId ?? ""}
				onChange={(e) => onChange(e.target.value.trim() || null)}
				placeholder="project-123"
				className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-xs placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
			/>
		</section>
	);
}
