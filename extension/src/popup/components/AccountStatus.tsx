type Props = {
	tier: "free" | "pro" | "byok";
	usage: number;
	limit: number;
};

export function AccountStatus({ tier, usage, limit }: Props) {
	return (
		<section style={{ marginBottom: 10 }}>
			<div style={{ fontSize: 12, marginBottom: 4 }}>Tier: {tier}</div>
			<div style={{ fontSize: 12 }}>
				Usage: {usage}/{limit}
			</div>
		</section>
	);
}

