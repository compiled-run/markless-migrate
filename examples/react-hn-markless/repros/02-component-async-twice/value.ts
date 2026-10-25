export async function slowValue(id: string): Promise<{ text: string }> {
	console.log(`slowValue(${id}) on the ${typeof window === 'undefined' ? 'server' : 'browser'}`);
	await new Promise((done) => setTimeout(done, 30));
	return { text: `value ${id}` };
}
