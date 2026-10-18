import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { serve, type Variant } from '../../fixtures/motion/server.ts';
import { renderHtml } from '../../src/check/html.ts';
import { runCheck } from '../../src/check/run.ts';
import type { Report } from '../../src/check/types.ts';

const DESKTOP = [{ name: 'desktop', width: 1280, height: 800, isMobile: false }];
const TOGGLE = 'click button "Getting Started"';

describe('motion: the transitions and animations each interaction starts, old vs new', { concurrency: 3 }, () => {
	let browser: Browser;
	const servers: { close(): void }[] = [];
	const app = async (variant: Variant) => {
		const { origin, server } = await serve(variant);
		servers.push(server);
		return origin;
	};
	before(async () => {
		browser = await chromium.launch();
	});
	after(async () => {
		for (const s of servers) s.close();
		await browser?.close();
	});
	const check = async (oldVariant: Variant, newVariant: Variant): Promise<Report> => runCheck({ oldOrigin: await app(oldVariant), newOrigin: await app(newVariant), routes: ['/'], browser, viewports: DESKTOP, motion: {} });
	const motion = (report: Report) => report.routes[0]!.failures.filter((f) => f.dimension === 'motion');

	test('a category that collapses at once where the old one animates its height is red, naming the element and the duration', async () => {
		const report = await check('animated', 'instant');
		const route = report.routes[0]!;
		assert.equal(route.dimensions.motion, 'fail');
		const failure = motion(report).find((f) => f.check.startsWith(`${TOGGLE}: motion of `));
		assert.ok(failure, motion(report).map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
		assert.equal(failure.check, `${TOGGLE}: motion of list (main>navigation>list/ul)`);
		assert.match(failure.expected, /^old animates height \d+(\.\d+)?px→0px over 250 ms ease-in-out$/);
		assert.match(failure.actual, /^new jumps: list .* has no transition or animation of height$/);
		const interaction = route.motion!.interactions.find((i) => i.name === TOGGLE)!;
		assert.equal(interaction.ok, false);
		assert.ok(interaction.old.some((l) => /transition of height .* over 250 ms ease-in-out/.test(l)), interaction.old.join('\n'));
		const strip = route.filmstrips?.find((s) => s.label === TOGGLE);
		assert.ok(strip, 'the differing interaction has a filmstrip');
		assert.deepEqual(strip.offsets, [0, 63, 125, 188, 250]);
		assert.equal(strip.old.length, 5);
		assert.equal(strip.new.length, 5);
		assert.ok(!strip.old[0]!.equals(strip.new[0]!), 'the old list is still open at the start, the new one has already jumped shut');
		assert.ok(strip.old[4]!.equals(strip.new[4]!), 'both end collapsed');
		assert.match(renderHtml(report), /class="filmstrip"/);
	});

	test('the same animation on both sides is green, and reduced motion agrees', async () => {
		const report = await check('animated', 'same');
		const route = report.routes[0]!;
		assert.equal(route.dimensions.motion, 'pass', motion(report).map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
		const interaction = route.motion!.interactions.find((i) => i.name === TOGGLE)!;
		assert.equal(interaction.ok, true);
		assert.equal(interaction.reduced?.ok, true);
		assert.ok(![...interaction.reduced!.old, ...interaction.reduced!.new].some((l) => /height/.test(l)), 'reduced motion drops the height transition on both sides');
		assert.ok(route.motion!.interactions.some((i) => i.name === 'hover button "Getting Started"' && i.ok && i.old.some((l) => /background-color rgb\(255, 255, 255\)→rgb\(238, 238, 238\) over 150 ms ease$/.test(l))), JSON.stringify(route.motion!.interactions));
		assert.equal(route.filmstrips, undefined);
		assert.ok(!(route.motion!.unexercised ?? []).some((r) => r.startsWith('`.items`') || r.startsWith('`.toggle`')), 'both motion rules of the old stylesheet ran');
	});

	test('a page that keeps animating when the visitor asks for reduced motion is red', async () => {
		const report = await check('animated', 'reduced');
		const failure = motion(report).find((f) => f.check.startsWith(`${TOGGLE}, with prefers-reduced-motion: reduce: extra motion of `));
		assert.ok(failure, motion(report).map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
		assert.equal(failure.expected, 'old does not animate height');
		assert.match(failure.actual, /^new animates height .* over 250 ms ease-in-out$/);
		assert.ok(!motion(report).some((f) => f.check.startsWith(`${TOGGLE}: `)), 'with motion allowed the two agree');
	});
});
