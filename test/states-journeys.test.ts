import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEnv } from '../src/check/browser.ts';
import { withFailures } from '../src/check/compare.ts';
import { statesAndJourneys } from '../src/check/run.ts';
import type { Failure, RouteResult } from '../src/check/types.ts';

const fail = (check: string): Failure => ({ route: '/', dimension: check.startsWith('state') ? 'css' : 'behaviour', check, expected: 'a', actual: 'b', hint: 'c' });
const loaded = withFailures({ route: '/', ok: true, dimensions: {} as RouteResult['dimensions'], failures: [], weight: { old: { downloaded: 0, source: 0, executed: 0 }, new: { downloaded: 0, source: 0, executed: 0 } }, visualDiffs: [], shots: [], writes: [{ line: 'load', reason: 'r', sent: false, during: 'page load' }] }, [fail('load')]);
const states = async (input: RouteResult) => withFailures(input, [...input.failures.map((f) => ({ ...f, actual: 'explained' })), fail('state :hover')], { states: { checked: [':hover'], skipped: [] } });
const journeys = async (input: RouteResult) => withFailures(input, [...input.failures, fail('click Menu')], { journeys: [], coverage: { total: 1, exercised: 1, elements: [], skipped: 0 }, writes: [...(input.writes ?? []), { line: 'POST /x', reason: 'r', sent: false, during: 'click Menu' }] });

test('states and journeys side by side give the result of journeys run on top of states', async () => {
	const held = { old: defaultEnv('https://old.example'), new: defaultEnv('https://new.example') };
	assert.equal(held.old.sendWrites || held.new.sendWrites, false);
	let overlapped = false;
	let running = 0;
	const track = (work: (input: RouteResult) => Promise<RouteResult>) => async (input: RouteResult) => {
		running++;
		await new Promise((done) => setTimeout(done, 20));
		overlapped ||= running === 2;
		running--;
		return work(input);
	};
	assert.deepEqual(await statesAndJourneys(held, loaded, track(states), track(journeys)), await journeys(await states(loaded)));
	assert.ok(overlapped, 'the two ran at once');
});

test('with writes sent, journeys wait for the states: what a journey writes could show in a forced state', async () => {
	const sent = { old: defaultEnv('http://127.0.0.1:1'), new: defaultEnv('http://127.0.0.1:2') };
	const order: string[] = [];
	await statesAndJourneys(sent, loaded, async (input) => (order.push('states start'), await new Promise((done) => setTimeout(done, 10)), order.push('states end'), states(input)), async (input) => (order.push('journeys start'), journeys(input)));
	assert.deepEqual(order, ['states start', 'states end', 'journeys start']);
});

test('a failing side stops the route only once the other has finished', async () => {
	const held = { old: defaultEnv('https://old.example'), new: defaultEnv('https://new.example') };
	let finished = false;
	await assert.rejects(
		statesAndJourneys(held, loaded, async () => { throw new Error('states broke'); }, async (input) => { await new Promise((done) => setTimeout(done, 20)); finished = true; return journeys(input); }),
		/states broke/,
	);
	assert.ok(finished);
});
