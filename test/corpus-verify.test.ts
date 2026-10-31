import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { names, verdicts } from '../scripts/corpus.ts';
import { CASES } from './corpus/site.ts';

const bug = (id: string, extra: object = {}) => ({ id, report: id, build: 'b', route: '/r', caught: '^behaviour: click button "Shuffle"[^|]*\\|', fixture: id, ...extra });
const finding = (check: string, extra: object = {}) => ({ dimension: 'behaviour', check, expected: 'changes main', actual: 'nothing changed on the port', ...extra });

test("a finding names a bug only from its own step: not a control the run never used, not an accepted difference, not another control's step", () => {
	const b = bug('shuffle');
	assert.ok(names(b, finding('click button "Shuffle"')));
	assert.ok(!names(b, finding('not exercised: button "Shuffle"')));
	assert.ok(!names(b, finding('click button "Shuffle"', { accepted: { reason: 'x' } })));
	assert.ok(!names(b, finding('menu button keys on button "Menu": … menuitem "Shuffle R"')));
});

test('a bug is caught, missed, not checked (its route timed out or has no report), or pending', () => {
	const corpus = { builds: { b: 'url' }, bugs: [bug('a'), bug('b', { route: '/timed-out' }), bug('c', { route: '/absent' }), bug('d', { route: '/other' }), bug('e', { route: '/other', pending: 'later work' }), { ...bug('f'), build: null }] };
	const reports = new Map([['b', [
		{ route: '/r', ok: false, failures: [finding('click button "Shuffle"')] },
		{ route: '/timed-out', ok: false, infrastructure: { message: 'did not finish within 3600 s' }, failures: [] },
		{ route: '/other', ok: false, failures: [finding('click button "Other"')] },
	]]]);
	assert.deepEqual(verdicts(corpus, reports).map((v) => `${v.bug.id} ${v.state}`), ['a caught', 'b not checked', 'c not checked', 'd missed', 'e missed']);
});

test('every bug of bugs.json names its micro-site case, and every matcher compiles', async () => {
	const corpus = JSON.parse(await readFile(new URL('../deploy/shadcn-ui/corpus/bugs.json', import.meta.url), 'utf8')) as { builds: Record<string, string>; bugs: { id: string; build: string | null; caught: string; fixture: string }[] };
	for (const b of corpus.bugs) {
		assert.ok(CASES[b.fixture], `${b.id}: no case ${b.fixture} in test/corpus/site.ts`);
		assert.doesNotThrow(() => new RegExp(b.caught), b.id);
		if (b.build) assert.ok(corpus.builds[b.build], `${b.id}: no build ${b.build}`);
	}
});

test("every case's pages carry scripts that parse, on both sides", () => {
	for (const [id, c] of Object.entries(CASES)) {
		for (const html of [c.old, c.mutant]) for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]!), id);
	}
});
