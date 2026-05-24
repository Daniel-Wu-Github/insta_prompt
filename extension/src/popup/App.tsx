import { AccountStatus } from "./components/AccountStatus";
import { ModeToggle } from "./components/ModeToggle";
import { ProjectSelector } from "./components/ProjectSelector";
import { UpgradeCTA } from "./components/UpgradeCTA";
import { useAccountStatus } from "./hooks/useAccountStatus";
import { useSettings } from "./hooks/useSettings";

export default function App() {
	const { settings, isLoading, setMode, setProjectId } = useSettings();
	const account = useAccountStatus();

	if (isLoading) {
		return <main style={{ padding: 12 }}>Loading settings...</main>;
	}

	const showUpgradeCTA =
		account.tier === "free" &&
		!account.isLoading &&
		!account.error &&
		account.usage !== null &&
		account.usage.count >= account.usage.limit;

	return (
		<main style={{ width: 320, padding: 12, fontFamily: "system-ui, sans-serif" }}>
			<h1 style={{ margin: "0 0 12px 0", fontSize: 16 }}>PromptCompiler</h1>

			<ModeToggle mode={settings.mode} onChange={setMode} />
			<ProjectSelector projectId={settings.projectId} onChange={setProjectId} />
			<AccountStatus
				tier={account.tier}
				usage={account.usage}
				isLoading={account.isLoading}
				error={account.error}
			/>
			<UpgradeCTA visible={showUpgradeCTA} />
		</main>
	);
}
