import { useEffect, useState } from "react";

import {
	PROMPT_HISTORY_PINNED_LIMIT,
	PROMPT_HISTORY_STORAGE_KEY,
	deletePromptHistoryEntry,
	isPromptHistoryEntry,
	readPromptHistory,
	setPromptPinned,
	type PromptHistoryEntry,
} from "../../lib/prompt-history";

export function usePromptHistory() {
	const [entries, setEntries] = useState<PromptHistoryEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		void readPromptHistory().then((loaded) => {
			setEntries(loaded);
			setIsLoading(false);
		});

		// Storage is the source of truth: pin/delete writes (and commits landing
		// from a content script while the popup is open) all flow back through
		// onChanged, so local state never needs manual reconciliation.
		const handleStorageChange = (
			changes: { [key: string]: chrome.storage.StorageChange },
			areaName: string,
		): void => {
			if (areaName !== "local") return;
			const change = changes[PROMPT_HISTORY_STORAGE_KEY];
			if (!change) return;
			setEntries(Array.isArray(change.newValue) ? change.newValue.filter(isPromptHistoryEntry) : []);
		};

		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => { chrome.storage.onChanged.removeListener(handleStorageChange); };
	}, []);

	const pin = async (id: string, pinned: boolean): Promise<void> => {
		const result = await setPromptPinned(id, pinned);
		setNotice(
			!result.ok && result.reason === "pin-limit"
				? `Template limit reached (${PROMPT_HISTORY_PINNED_LIMIT}). Unpin one first.`
				: null,
		);
	};

	const remove = async (id: string): Promise<void> => {
		await deletePromptHistoryEntry(id);
		setNotice(null);
	};

	return { entries, isLoading, notice, pin, remove };
}
