// A dialog a journey opens, at each width, old and new, with motion allowed: where it sits and how big it is in the viewport once open, and how it comes in and goes out, frame by frame.
import type { Browser, Page } from 'playwright';
import type { SideEnv } from './browser.ts';
import { openSession, perform, type RecordedJourney, type Step } from './journeys.ts';
import { dialogFindings, type DialogFrame, type DialogRun, type DialogsRow } from './dialogs-compare.ts';
import { motionEnv } from './motion.ts';
import type { Viewport } from './types.ts';

/** How long each of the opening and the closing is watched. */
const WINDOW_MS = 1_200;

type Recorder = { frames: DialogFrame[]; stop: boolean };

// Runs in the page: each animation frame, the largest dialog shown and its opacity (its own and its holders'), until stopped.
function armDialogFrames(): void {
	const w = window as unknown as { __mmDialogFrames?: Recorder };
	if (w.__mmDialogFrames) w.__mmDialogFrames.stop = true;
	const rec: Recorder = { frames: [], stop: false };
	w.__mmDialogFrames = rec;
	const start = performance.now();
	const read = (): Omit<DialogFrame, 't'> => {
		const shown = [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]')].filter((d) => d.checkVisibility({ visibilityProperty: true }));
		const boxes = shown.map((d) => ({ d, r: d.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0);
		const top = boxes.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
		if (!top) return {};
		let opacity = 1;
		for (let at: Element | null = top.d; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
		return { box: [top.r.x, top.r.y, top.r.width, top.r.height].map(Math.round).join(','), opacity: Math.round(opacity * 100) / 100 };
	};
	const tick = () => {
		if (rec.stop) return;
		const now = read();
		const last = rec.frames.at(-1);
		if (!last || last.box !== now.box || last.opacity !== now.opacity) rec.frames.push({ t: Math.round(performance.now() - start), ...now });
		requestAnimationFrame(tick);
	};
	tick();
}

const readFrames = (page: Page) => page.evaluate(() => {
	const rec = (window as unknown as { __mmDialogFrames?: Recorder }).__mmDialogFrames;
	if (rec) rec.stop = true;
	return rec?.frames ?? [];
});

async function recordDialog(browser: Browser, env: SideEnv, route: string, viewport: Viewport, steps: readonly Step[]): Promise<DialogRun> {
	const session = await openSession(browser, motionEnv(env, false), route, viewport);
	try {
		for (const step of steps.slice(0, -1)) {
			const r = await session.run(step);
			if (r.failed) return { failed: r.failed, enter: [], exit: [] };
		}
		const page = session.page;
		await page.evaluate(armDialogFrames);
		try {
			await perform(page, steps.at(-1)!);
		} catch (error) {
			return { failed: (error as Error).message.split('\n')[0]!, enter: [], exit: [] };
		}
		await page.waitForTimeout(WINDOW_MS);
		const enter = await readFrames(page);
		await page.evaluate(armDialogFrames);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(WINDOW_MS);
		return { enter, exit: await readFrames(page) };
	} catch (error) {
		return { failed: (error as Error).message.split('\n')[0]!, enter: [], exit: [] };
	} finally {
		await session.close();
	}
}

/** Each dialog a journey opened, at every width, old and new; the old side again where the first two differ. */
export async function observeDialogs(browser: Browser, sides: { readonly old: SideEnv; readonly new: SideEnv }, route: string, viewports: readonly Viewport[], journeys: readonly RecordedJourney[]): Promise<DialogsRow> {
	const out: DialogsRow['viewports'][number][] = [];
	for (const viewport of viewports) {
		const dialogs: DialogsRow['viewports'][number]['dialogs'][number][] = [];
		for (const j of journeys) {
			const [old, next] = await Promise.all([recordDialog(browser, sides.old, route, viewport, j.steps), recordDialog(browser, sides.new, route, viewport, j.steps)]);
			const olds = dialogFindings(viewport, old, [], next).length ? [old, await recordDialog(browser, sides.old, route, viewport, j.steps)] : [old];
			dialogs.push({ journey: j.name, olds, next });
		}
		out.push({ viewport: viewport.name, width: viewport.width, height: viewport.height, dialogs });
	}
	return { viewports: out };
}
