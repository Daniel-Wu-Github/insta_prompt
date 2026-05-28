import type { Tier } from "../../../../shared/contracts";
import type { AccountUsage } from "../hooks/useAccountStatus";

type Props = {
	tier: Tier;
	usage: AccountUsage | null;
	isLoading: boolean;
	error: boolean;
};

const TIER_STYLES: Record<Tier, string> = {
	free: "bg-tier-free text-zinc-200",
	pro: "bg-tier-pro text-white",
	byok: "bg-tier-byok text-white",
};

const TIER_LABELS: Record<Tier, string> = {
	free: "Free",
	pro: "Pro",
	byok: "BYOK",
};

export function AccountStatus({ tier, usage, isLoading, error }: Props) {
	const pct =
		usage && usage.limit > 0
			? Math.min(100, Math.round((usage.count / usage.limit) * 100))
			: 0;

	const usageText = isLoading || error || !usage ? "--/--" : `${usage.count}/${usage.limit}`;

	return (
		<section className="mb-4">
			<div className="flex items-center justify-between mb-2">
				<span className="text-xs font-medium text-muted uppercase tracking-wider">Usage</span>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted">{usageText}</span>
					<span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIER_STYLES[tier]}`}>
						{TIER_LABELS[tier]}
					</span>
				</div>
			</div>
			<div className="h-1.5 rounded-full bg-surface overflow-hidden border border-border">
				{!isLoading && !error && usage && (
					<div
						className={`h-full rounded-full transition-all duration-300 ${
							pct >= 90 ? "bg-warning" : "bg-brand"
						}`}
						style={{ width: `${pct}%` }}
					/>
				)}
			</div>
		</section>
	);
}
