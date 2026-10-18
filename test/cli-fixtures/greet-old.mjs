#!/usr/bin/env node
// The old tool: `greet init` asks two questions, writes a project and fetches its template from the registry.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const started = performance.now();
const [command, ...flags] = process.argv.slice(2);
const lines = [];
let wake;
process.stdin.on('data', (chunk) => {
	lines.push(...chunk.toString().split(/\r?\n|\r/).filter(Boolean));
	wake?.();
});
process.stdin.on('end', () => wake?.());
const ask = async (question, fallback) => {
	process.stdout.write(question);
	while (!lines.length && !process.stdin.readableEnded) await new Promise((done) => (wake = done));
	const answer = lines.shift() ?? fallback;
	process.stdout.write(`${answer}\n`);
	return answer;
};

if (command === '--version') {
	console.log('greet v1.4.2');
	process.exit(0);
}
if (command !== 'init') {
	console.error(`unknown command: ${command ?? '(none)'}`);
	process.exit(2);
}
if (existsSync('greet.json')) {
	console.error('greet.json already exists');
	process.exit(1);
}
const yes = flags.includes('--yes');
const name = yes ? 'demo' : await ask('Project name? ', 'demo');
const typescript = (yes ? 'y' : await ask('Use TypeScript? (y/n) ', 'n')) === 'y';
const registry = process.env.GREET_REGISTRY ?? 'https://registry.greet.dev';
const template = await fetch(`${registry}/templates/${name}.json`).then((r) => (r.ok ? r.text() : '{}'), () => '{"offline":true}');
writeFileSync('greet.json', `${JSON.stringify({ name, typescript, createdAt: new Date().toISOString() }, null, 2)}\n`);
mkdirSync('src', { recursive: true });
const entry = join(process.cwd(), 'src', typescript ? 'index.ts' : 'index.js');
writeFileSync(entry, `console.log('hello from ${name}');\n`);
writeFileSync('template.json', template);
mkdirSync(join(process.env.HOME, '.greet'), { recursive: true });
writeFileSync(join(process.env.HOME, '.greet', 'recent'), `${process.cwd()}\n`);
console.log(`\u001b[32mCreated greet.json in ${Math.round(performance.now() - started + Math.random() * 50)}ms\u001b[0m`);
console.log(`Wrote ${entry}`);
