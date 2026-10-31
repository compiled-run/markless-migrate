// convert binds a library's port to an element only through shadcn's data-slot (src/convert/parts.ts bindParts), and the
// upstream test apps render the libraries bare. So the adapter writes the data-slot shadcn's wrapper would on each of the
// library's JSX elements (`<Command.Input` gets data-slot="command-input"), in the test app's source, before it is built:
// the library and the port both run that source.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const kebab = (name: string) => name.replace(/\.Root$/, '').replace(/\./g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function withSlots(source: string, roots: readonly string[]): string {
	const pattern = new RegExp(`<((?:${roots.join('|')})(?:\\.[A-Z]\\w*)?)(?=[\\s>/])(?![^>]*\\bdata-slot=)`, 'g');
	return source.replace(pattern, (whole, name: string) => `${whole} data-slot="${kebab(name)}"`);
}

export async function addSlots(dir: string, roots: readonly string[]): Promise<number> {
	let changed = 0;
	for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !/\.[jt]sx$/.test(entry.name) || entry.parentPath.includes('node_modules')) continue;
		const file = join(entry.parentPath, entry.name);
		const before = await readFile(file, 'utf8');
		const after = withSlots(before, roots);
		if (after !== before) {
			await writeFile(file, after);
			changed++;
		}
	}
	return changed;
}

if (import.meta.main) {
	const [dir, ...roots] = process.argv.slice(2);
	process.stdout.write(`data-slot written in ${await addSlots(dir!, roots)} files\n`);
}
