import type { Tier } from "../../../../shared/contracts";
import type { AccountUsage } from "../hooks/useAccountStatus";

type Props = {
	tier: Tier;
	usage: AccountUsage | null;
	isLoading: boolean;
	error: boolean;
};

export function AccountStatus({ tier, usage, isLoading, error }: Props) {
	const usageLabel = (() => {
		if (isLoading) {
			return "--/--";
		}

		if (!usage) {
			return error ? "--/--" : "n/a";
		}

		return `${usage.count}/${usage.limit}`;
	})();

	return (
		<section style={{ marginBottom: 10 }}>
			<div style={{ fontSize: 12, marginBottom: 4 }}>Tier: {tier}</div>
			<div style={{ fontSize: 12 }}>Usage: {usageLabel}</div>
		</section>
	);
}
