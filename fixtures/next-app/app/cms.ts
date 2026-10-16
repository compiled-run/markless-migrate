export async function cms<T>(path: string): Promise<T | undefined> {
	const base = process.env.CMS_URL;
	if (!base) return undefined;
	try {
		const response = await fetch(`${base}${path}`, { cache: 'no-store' });
		return response.ok ? ((await response.json()) as T) : undefined;
	} catch {
		return undefined;
	}
}
