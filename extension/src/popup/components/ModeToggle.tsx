type Mode = "efficiency" | "balanced" | "detailed";

type Props = {
	mode: Mode;
	onChange: (mode: Mode) => void;
};

const MODE_OPTIONS: Mode[] = ["efficiency", "balanced", "detailed"];

export function ModeToggle({ mode, onChange }: Props) {
	return (
		<section style={{ marginBottom: 10 }}>
			<label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Mode</label>
			<select
				value={mode}
				onChange={(event) => onChange(event.target.value as Mode)}
				style={{ width: "100%", padding: 6 }}
			>
				{MODE_OPTIONS.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</section>
	);
}

