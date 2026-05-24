type Props = {
	visible: boolean;
};

export function UpgradeCTA({ visible }: Props) {
	if (!visible) {
		return null;
	}

	return (
		<section>
			<button type="button" style={{ width: "100%", padding: 8 }}>
				Upgrade to Pro
			</button>
		</section>
	);
}
