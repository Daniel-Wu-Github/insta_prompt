import { useEffect, useState } from "react";

const CLAUSE_ORDERING_STORAGE_KEY = "promptcompiler.clauseOrdering";

export type ClauseOrdering = "entry" | "canonical";

const DEFAULT_CLAUSE_ORDERING: ClauseOrdering = "entry";

function isClauseOrdering(value: unknown): value is ClauseOrdering {
	return value === "entry" || value === "canonical";
}

export function useClauseOrdering() {
	const [ordering, setOrdering] = useState<ClauseOrdering>(DEFAULT_CLAUSE_ORDERING);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		chrome.storage.sync.get(CLAUSE_ORDERING_STORAGE_KEY, (result) => {
			const stored = result[CLAUSE_ORDERING_STORAGE_KEY];
			setOrdering(isClauseOrdering(stored) ? stored : DEFAULT_CLAUSE_ORDERING);
			setIsLoading(false);
		});
	}, []);

	const set = (next: ClauseOrdering): void => {
		// Write first, then update local state in the callback (extension-popup-ux Rule 3).
		chrome.storage.sync.set({ [CLAUSE_ORDERING_STORAGE_KEY]: next }, () => {
			setOrdering(next);
		});
	};

	return { ordering, isLoading, set };
}
