type Props = {
	projectId: string | null;
	onChange: (projectId: string | null) => void;
};

export function ProjectSelector({ projectId, onChange }: Props) {
	return (
		<section style={{ marginBottom: 10 }}>
			<label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Project ID (optional)</label>
			<input
				value={projectId ?? ""}
				onChange={(event) => onChange(event.target.value.trim() || null)}
				placeholder="project-123"
				style={{ width: "100%", padding: 6 }}
			/>
		</section>
	);
}

