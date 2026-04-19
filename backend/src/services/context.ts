export async function fetchProjectContext(projectId: string | null | undefined): Promise<string | null> {
	if (!projectId) {
		return null;
	}
	return `project:${projectId}`;
}

