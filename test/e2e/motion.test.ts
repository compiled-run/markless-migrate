import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { serve as serveCanvas, type Variant as CanvasVariant } from '../../fixtures/motion-canvas/server.ts';
import { serve as serveDisclosure, type Variant as DisclosureVariant } from '../../fixtures/motion-disclosure/server.ts';
import { serve as serveModal, type Variant as ModalVariant } from '../../fixtures/motion-exit/server.ts';
import { serve as serveTimer } from '../../fixtures/motion-timer/server.ts';
import { serve, type Variant } from '../../fixtures/motion/server.ts';
import { pngBytes } from '../../src/check/artifacts.ts';
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
		assert.ok(!pngBytes(strip.old[0]!).equals(pngBytes(strip.new[0]!)), 'the old list is still open at the start, the new one has already jumped shut');
		assert.ok(pngBytes(strip.old[4]!).equals(pngBytes(strip.new[4]!)), 'both end collapsed');
		assert.match(renderHtml(report), /class="filmstrip"/);
	});

	test('a fade a 2 s timer starts after the click is recorded on both sides, however long the click held either page', async () => {
		const timer = async (busy: number) => {
			const { origin, server } = await serveTimer(busy);
			servers.push(server);
			return origin;
		};
		const report = await runCheck({ oldOrigin: await timer(0), newOrigin: await timer(1800), routes: ['/'], browser, viewports: DESKTOP, motion: {} });
		const route = report.routes[0]!;
		assert.equal(route.dimensions.motion, 'pass', motion(report).map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
		const interaction = route.motion!.interactions.find((i) => i.name === 'press Enter on button "Copy code"');
		assert.ok(interaction, route.motion!.interactions.map((i) => i.name).join('\n'));
		const fades = ['transition of opacity 0→1 over 250 ms ease', 'transition of opacity 1→0 over 250 ms ease'];
		for (const side of [interaction.old, interaction.new]) assert.deepEqual(side.map((l) => l.replace(/^.*: /, '')), fades, 'each side records the fade in and, after the timer, the fade out');
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

	test("a backdrop shown again at full opacity between the end of its own fade and the end of the panel's is red, though both pages start the same animations", async () => {
		const modal = async (variant: ModalVariant) => {
			const { origin, server } = await serveModal(variant);
			servers.push(server);
			return origin;
		};
		const run = async (oldVariant: ModalVariant, newVariant: ModalVariant) => runCheck({ oldOrigin: await modal(oldVariant), newOrigin: await modal(newVariant), routes: ['/'], browser, viewports: DESKTOP, motion: {} });
		const close = 'click button "Add user", then click button "Cancel"';
		const red = await run('presence', 'shared');
		const failure = motion(red).find((f) => f.check.startsWith(`${close}: frame of `));
		assert.ok(failure, motion(red).map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
		assert.equal(failure.check, `${close}: frame of generic (body/div)`);
		assert.equal(failure.expected, 'old at 150 ms, just after animation exit of generic (body/div) ends: not shown');
		assert.equal(failure.actual, 'new: shown at opacity 1');
		assert.ok(!motion(red).some((f) => f.check.startsWith(`${close}: frame of dialog`)), 'the panel leaves alike on both sides');
		assert.equal(red.routes[0]!.dimensions.motion, 'fail');
		const green = await run('presence', 'presence');
		assert.deepEqual(motion(green).map((f) => `${f.check}: ${f.expected} / ${f.actual}`), [], 'each element hidden at its own exit is green, with motion allowed and reduced');
	});

	test("an accordion panel whose height variable is left at auto and that leaves at once on close is red on both: the open frames and the missing exit", async () => {
		const faq = async (variant: DisclosureVariant) => {
			const { origin, server } = await serveDisclosure(variant);
			servers.push(server);
			return origin;
		};
		const run = async (newVariant: DisclosureVariant) => runCheck({ oldOrigin: await faq('measured'), newOrigin: await faq(newVariant), routes: ['/'], browser, viewports: DESKTOP, motion: {} });
		const [red, green] = await Promise.all([run('auto'), run('measured')]);
		const open = 'click button "What is your return policy?"';
		const lines = motion(red).map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n');
		const opening = motion(red).find((f) => f.check === `${open}: frame of region "What is your return policy?" (main>region/div)`);
		assert.ok(opening, lines);
		assert.match(opening.expected, /^old at \d+ ms: shown at opacity 1, 1232x[1-9]\d*/, 'the old panel is part way open');
		assert.match(opening.actual, /^new: shown at opacity 1, 1232x0 /, 'the new one has not grown at all yet');
		const closing = motion(red).find((f) => f.check === `${open} (step 2 of 3: use 2): motion of region "What is your return policy?" (main>region/div)`);
		assert.ok(closing, `the second use of the trigger, which closes the panel, is recorded:\n${lines}`);
		assert.match(closing.expected, /^old animates animation accordion-up \(height\) .*→0px over 200 ms ease-out$/);
		assert.match(closing.actual, /^new jumps: /);
		assert.equal(red.routes[0]!.dimensions.motion, 'fail');
		assert.deepEqual(motion(green).map((f) => `${f.check}: ${f.expected} / ${f.actual}`), [], 'a measured panel kept through its exit is green');
		assert.ok(green.routes[0]!.motion!.interactions.some((i) => i.name === `${open} (step 2 of 3: use 2)` && i.ok && i.old.some((l) => /accordion-up/.test(l))));
	});

	test('a canvas animated from load is compared frame by frame: the same drawing started later is green with its start gap reported, the same drawing 30 px lower is red', async () => {
		const drawn = async (variant: CanvasVariant) => {
			const { origin, server } = await serveCanvas(variant);
			servers.push(server);
			return origin;
		};
		const run = async (newVariant: CanvasVariant) => runCheck({ oldOrigin: await drawn('base'), newOrigin: await drawn(newVariant), routes: ['/'], browser, viewports: DESKTOP, motion: {} });
		const [late, low] = await Promise.all([run('late'), run('low')]);
		const lateCanvas = late.routes[0]!.motion?.canvases?.[0];
		assert.ok(lateCanvas, JSON.stringify(late.routes[0]!.motion));
		assert.equal(lateCanvas.verdict, 'same', JSON.stringify(lateCanvas));
		assert.ok(lateCanvas.gap.ms >= 250 && lateCanvas.gap.ms <= 550, `the drawing starts about 400 ms later: ${JSON.stringify(lateCanvas)}`);
		assert.ok(!motion(late).some((f) => f.check.startsWith('canvas frames from load')), motion(late).map((f) => f.check).join('\n'));
		const failure = motion(low).find((f) => f.check.startsWith('canvas frames from load: '));
		assert.ok(failure, JSON.stringify(low.routes[0]!.motion?.canvases));
		assert.match(failure.actual, /^new: [\d.]+% of the canvas differs from the best-matching old frame/);
		assert.equal(low.routes[0]!.motion?.canvases?.[0]?.verdict, 'differs');
	});
});
