import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { skillBody } from '../src/agents/skill.ts';
import { HINTS } from '../src/check/hints.ts';
import { buildPrompt } from '../src/run/loop.ts';

const root = new URL('..', import.meta.url).pathname;
const CLI = join(root, 'src/cli.ts');
// Phrases that hand a decision to the person who asked for the migration, or stop for one.
const ASKS = /ask (the |them |a )?(user|owner|person|human)|ask whether|ask which|for (owner )?review|a person decides|person's (call|decision)|needs a human|tell the user|propose it to the user|let them run|\bisland\b|wait for (an )?(answer|approval)(?! during)/i;

test('nothing the agent reads during a migration asks the person a question or waits for a decision', async () => {
	const texts: [string, string][] = [
		['skill', skillBody()],
		['run prompt', buildPrompt({ old: 'http://o', new: 'http://n', cli: 'markless-migrate' }, '/', 'summary', 1)],
		['check hints', Object.values(HINTS).join('\n')],
		['cli help', spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' }).stdout],
	];
	for (const dir of ['src/mcp', 'src/library', 'src/run', 'src/switch']) for (const name of await readdir(join(root, dir))) if (name.endsWith('.ts')) texts.push([`${dir}/${name}`, await readFile(join(root, dir, name), 'utf8')]);
	for (const [where, text] of texts) {
		const hit = text.split('\n').find((line) => ASKS.test(line.replace(/Never ask them anything|never wait for an answer or an approval|Never ask a question or wait for an|Never ask the person anything or wait for an approval/gi, '')));
		assert.equal(hit, undefined, `${where}: ${hit}`);
	}
	assert.ok(texts.find(([w]) => w === 'cli help')![1].includes('markless-migrate'), 'the help was printed');
});

test('the docs no longer tell anyone to ask the owner, propose an accept, or keep a library as an island', async () => {
	for (const file of ['README.md', 'docs/plan.md']) {
		const hit = (await readFile(join(root, file), 'utf8')).split('\n').find((line) => ASKS.test(line));
		assert.equal(hit, undefined, `${file}: ${hit}`);
	}
});
