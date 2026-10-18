#!/usr/bin/env node
// The port: same behaviour, its own version number, and a different way of reading answers.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const t0 = Date.now();
const [command, ...flags] = process.argv.slice(2);
const queue = [];
const waiters = [];
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => (waiters.length ? waiters.shift()(line) : queue.push(line)));
rl.on('close', () => {
	while (waiters.length) waiters.shift()(undefined);
});
const ask = async (question, fallback) => {
	process.stdout.write(question);
	const answer = (queue.length ? queue.shift() : await new Promise((done) => waiters.push(done))) ?? fallback;
	process.stdout.write(`${answer}\n`);
	return answer;
};
const finish = (code) => {
	rl.close();
	process.exit(code);
};

if (command === '--version') {
	console.log('greet v2.0.0-beta.1');
	finish(0);
} else if (command !== 'init') {
	console.error(`unknown command: ${command ?? '(none)'}`);
	finish(process.env.GREET_BROKEN ? 1 : 2);
} else if (existsSync('greet.json')) {
	console.error('greet.json already exists');
	finish(1);
} else {
	const yes = flags.includes('--yes');
	const name = yes ? 'demo' : await ask('Project name? ', 'demo');
	const typescript = (yes ? 'y' : await ask('Use TypeScript? (y/n) ', 'n')) === 'y';
	const registry = process.env.GREET_REGISTRY ?? 'https://registry.greet.dev';
	const template = process.env.GREET_BROKEN ? '{}' : await fetch(`${registry}/templates/${name}.json`).then((r) => (r.ok ? r.text() : '{}'), () => '{"offline":true}');
	writeFileSync('greet.json', `${JSON.stringify(process.env.GREET_BROKEN ? { name, createdAt: new Date().toISOString() } : { name, typescript, createdAt: new Date().toISOString() }, null, 2)}\n`);
	mkdirSync('src', { recursive: true });
	const entry = join(process.cwd(), 'src', typescript ? 'index.ts' : 'index.js');
	writeFileSync(entry, `console.log('hello from ${name}');\n`);
	writeFileSync('template.json', template);
	mkdirSync(join(process.env.HOME, '.greet'), { recursive: true });
	writeFileSync(join(process.env.HOME, '.greet', 'recent'), `${process.cwd()}\n`);
	console.log(`Created greet.json in ${(Date.now() - t0) / 1000}s`);
	console.log(`Wrote ${entry}`);
	finish(0);
}
