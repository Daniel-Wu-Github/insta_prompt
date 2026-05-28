import { useEffect, useState } from "react";

const PAUSE_STORAGE_KEY = "promptcompiler.paused";

export function usePause() {
	const [paused, setPaused] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		chrome.storage.sync.get(PAUSE_STORAGE_KEY, (result) => {
			setPaused(result[PAUSE_STORAGE_KEY] === true);
			setIsLoading(false);
		});
	}, []);

	const toggle = (): void => {
		const next = !paused;
		chrome.storage.sync.set({ [PAUSE_STORAGE_KEY]: next }, () => {
			setPaused(next);
		});
	};

	return { paused, isLoading, toggle };
}
