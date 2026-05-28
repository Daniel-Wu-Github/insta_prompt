type Props = {
	visible: boolean;
};

export function UpgradeCTA({ visible }: Props) {
	if (!visible) {
		return null;
	}

	return (
		<section className="mb-4">
			<button
				type="button"
				className="w-full py-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
				onClick={() => chrome.tabs.create({ url: "https://promptcompiler-backend.fly.dev" })}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					className="w-4 h-4"
				>
					<path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
				</svg>
				Upgrade to Pro
			</button>
		</section>
	);
}
