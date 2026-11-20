// The checker's part of a `check --reuse` key is the code the check command runs, read from the module graph: an edit
// to the converter, a part's code or another command changes nothing a kept check result depends on.
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../src/code-closure.ts';
import { checkCommand, checkerVersion, type CheckerVersion } from '../src/check/checker-version.ts';

test("the check command's code is attributed whole: what runs it, its branch of main, every declaration it reaches, and no other command's", async () => {
	const command = await checkCommand();
	assert.deepEqual(command.problems, []);
	assert.ok(command.names.includes('runCheck') && command.names.includes('selectReusable'));
	assert.ok(!command.names.includes('planCommand') && !command.names.includes('main'));
	const v = await checkerVersion();
	assert.deepEqual(v.problems, []);
	const files = new Set(v.units.map((u) => u.slice(0, u.lastIndexOf(':'))));
	for (const f of ['src/cli.ts', 'src/check/run.ts', 'src/check/journeys.ts']) assert.ok(files.has(f), f);
	for (const f of ['src/convert/index.ts', 'src/convert/reveal.ts', 'src/plan/command.ts', 'src/dev/index.ts']) assert.ok(!files.has(f), `${f} is another command's code`);
});

test("editing code the check command runs changes the checker's version; the converter, another command, or a part's code with the same selectors does not", { timeout: 600_000 }, async () => {
	const repo = await mkdtemp(join(tmpdir(), 'checker-version-'));
	try {
		for (const name of ['src', 'parts', 'package.json', 'datasets.lock']) await cp(join(ROOT, name), join(repo, name), { recursive: true });
		await symlink(join(ROOT, 'node_modules'), join(repo, 'node_modules'));
		const mod = (await import(join(repo, 'src/check/checker-version.ts'))) as { checkerVersion: () => Promise<CheckerVersion> };
		const base = await mod.checkerVersion();
		assert.deepEqual(base.problems, []);
		const after = async (file: string, edit: (text: string) => string): Promise<boolean> => {
			const path = join(repo, file);
			const text = await readFile(path, 'utf8');
			const edited = edit(text);
			assert.notEqual(edited, text, `the edit to ${file} applies`);
			await writeFile(path, edited);
			try {
				return (await mod.checkerVersion()).version !== base.version;
			} finally {
				await writeFile(path, text);
			}
		};
		const inside = (word: string) => (text: string) => text.replace(word, `${word}/*edit*/`);
		assert.equal(await after('src/check/run.ts', inside('export async function runCheck')), true, 'the check itself');
		assert.equal(await after('src/cli.ts', inside("case 'check': {")), true, "main's check branch");
		assert.equal(await after('src/convert/reveal.ts', inside('export async function captureRouteReveals')), false, 'a recorder of the converter');
		assert.equal(await after('src/cli.ts', inside("case 'plan':")), false, "another command's branch");
		assert.equal(await after('src/plan/command.ts', inside('export async function planCommand')), false, 'the planner');
		assert.equal(await after('parts/cmdk.ts', (t) => `${t}\n// a comment, no selector\n`), false, "a part's code the checker never runs, its selectors the same");
		assert.equal(await after('parts/cmdk.ts', (t) => `${t}\nexport const PROBE_EDIT = '[data-probe-edit]';\n`), true, 'a selector the widget probes read');
		const variable = base.env.find((e) => e.startsWith('MARKLESS_MIGRATE_') && !['MARKLESS_MIGRATE_TOKEN', 'MARKLESS_MIGRATE_PROFILE', 'MARKLESS_MIGRATE_STACK'].includes(e))!;
		process.env[variable] = '987';
		try {
			assert.notEqual((await mod.checkerVersion()).version, base.version, `${variable}, which the checker reads`);
		} finally {
			delete process.env[variable];
		}
		process.env.MARKLESS_MIGRATE_PROFILE = '1';
		try {
			assert.equal((await mod.checkerVersion()).version, base.version, 'check.yml profiles its shards and check-select does not: a diagnostic switch is no part of the key');
		} finally {
			delete process.env.MARKLESS_MIGRATE_PROFILE;
		}
		const before = process.env.GH_TOKEN;
		process.env.GH_TOKEN = 'one';
		const one = (await mod.checkerVersion()).version;
		process.env.GH_TOKEN = 'two';
		assert.equal((await mod.checkerVersion()).version, one, "a credential counts by whether one is set, not by its value");
		if (before === undefined) delete process.env.GH_TOKEN;
		else process.env.GH_TOKEN = before;
	} finally {
		await rm(repo, { recursive: true, force: true });
	}
});
