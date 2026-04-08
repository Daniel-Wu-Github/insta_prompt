export async function fetchProjectContext(projectId: string | null): Promise<string | null> {
	if (!projectId) {
		return null;
	}
	return `project:${projectId}`;
}

