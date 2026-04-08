import { useEffect, useMemo, useState } from "react";

type Mode = "efficiency" | "balanced" | "detailed";

type Settings = {
	mode: Mode;
	projectId: string | null;
};

const DEFAULT_SETTINGS: Settings = {
	mode: "balanced",
	projectId: null,
};

const STORAGE_KEY = "promptcompiler.settings";

export function useSettings() {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		chrome.storage.local.get(STORAGE_KEY, (result) => {
			const stored = result[STORAGE_KEY] as Settings | undefined;
			if (stored) {
				setSettings({
					mode: stored.mode ?? DEFAULT_SETTINGS.mode,
					projectId: stored.projectId ?? DEFAULT_SETTINGS.projectId,
				});
			}
			setIsLoading(false);
		});
	}, []);

	const persist = (next: Settings) => {
		setSettings(next);
		chrome.storage.local.set({ [STORAGE_KEY]: next });
	};

	const api = useMemo(
		() => ({
			settings,
			isLoading,
			setMode: (mode: Mode) => persist({ ...settings, mode }),
			setProjectId: (projectId: string | null) => persist({ ...settings, projectId }),
		}),
		[settings, isLoading],
	);

	return api;
}

