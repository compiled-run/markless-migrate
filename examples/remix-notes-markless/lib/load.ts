// Pages render on the server; these loaders never run in the browser.
const server = () => {
	if (!import.meta.env.SSR) throw new Error('This page renders on the server.');
	return import('../server/pages.ts');
};

export const loadUser = async () => (await server()).userFor();
export const loadNotes = async () => (await server()).notesFor();
export const loadNote = async (id: string) => (await server()).noteFor(id);
