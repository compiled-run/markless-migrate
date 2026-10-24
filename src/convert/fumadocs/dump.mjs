// Run in the old app's directory: registers fumadocs-mdx's Node loader and the data-only hooks, evaluates the generated
// collection file, and prints each collection's entries as JSON keyed by the glob paths the file names.
import { createRequire, register } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [serverFile] = process.argv.slice(2);
// The old app's own fumadocs-mdx, resolved from its directory.
const fromApp = createRequire(resolve(process.cwd(), 'package.json'));
const { register: registerFumadocs } = await import(pathToFileURL(fromApp.resolve('fumadocs-mdx/node')).href);
registerFumadocs();
register(new URL('./hooks.mjs', import.meta.url));

const text = await readFile(serverFile, 'utf8');
const globs = {};
for (const m of text.matchAll(/import (?:\* as|\{ default as) (__fd_glob_\d+) \}? ?from "([^"]+)"/g)) globs[m[1]] = m[2];
const out = {};
for (const [name, spec] of Object.entries(globs)) {
	const mod = await import(new URL(spec, pathToFileURL(serverFile)).href);
	out[name] = { ...mod };
}
process.stdout.write(JSON.stringify(out));
