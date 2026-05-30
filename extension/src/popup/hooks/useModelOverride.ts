import { useEffect, useState } from "react";

const FORCE_GROQ_STORAGE_KEY = "promptcompiler.forceGroq";

export function useModelOverride() {
	const [forceGroq, setForceGroq] = useState<boolean | null>(null);

	useEffect(() => {
		chrome.storage.sync.get(FORCE_GROQ_STORAGE_KEY, (result) => {
			setForceGroq(result[FORCE_GROQ_STORAGE_KEY] === true);
		});
	}, []);

	const toggle = (): void => {
		const next = !forceGroq;
		chrome.storage.sync.set({ [FORCE_GROQ_STORAGE_KEY]: next }, () => {
			setForceGroq(next);
		});
	};

	return { forceGroq, isLoading: forceGroq === null, toggle };
}
