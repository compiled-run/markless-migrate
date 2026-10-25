// A stand-in for a fetch that answers after half a second; it logs where it ran, so a second run in the browser shows in the console.
export async function slow(tag: string): Promise<{ text: string; side: string }> {
	const side = typeof window === 'undefined' ? 'server' : 'browser';
	console.error('slow()', side, tag);
	await new Promise((r) => setTimeout(r, 500));
	return { text: `loaded ${tag}`, side };
}

/** The same, answered in 50 ms: inside the 250 ms before @pending would show. */
export async function quick(tag: string): Promise<{ text: string; side: string }> {
	const side = typeof window === 'undefined' ? 'server' : 'browser';
	await new Promise((r) => setTimeout(r, 50));
	return { text: `loaded ${tag}`, side };
}
