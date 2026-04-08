import { AccountStatus } from "./components/AccountStatus";
import { ModeToggle } from "./components/ModeToggle";
import { ProjectSelector } from "./components/ProjectSelector";
import { UpgradeCTA } from "./components/UpgradeCTA";
import { useSettings } from "./hooks/useSettings";

export default function App() {
	const { settings, isLoading, setMode, setProjectId } = useSettings();

	if (isLoading) {
		return <main style={{ padding: 12 }}>Loading settings...</main>;
	}

	return (
		<main style={{ width: 320, padding: 12, fontFamily: "system-ui, sans-serif" }}>
			<h1 style={{ margin: "0 0 12px 0", fontSize: 16 }}>PromptCompiler</h1>

			<ModeToggle mode={settings.mode} onChange={setMode} />
			<ProjectSelector projectId={settings.projectId} onChange={setProjectId} />
			<AccountStatus tier="free" usage={0} limit={30} />
			<UpgradeCTA />
		</main>
	);
}

