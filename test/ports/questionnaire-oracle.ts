// What the real @shadcn/react Questionnaire shows after each step of a fixed script, recorded from ui.shadcn.com's own demos
// (deploy/shadcn-ui: serve-old.sh) into questionnaire-oracle.json, so the port is held to the library without React here.
// Record: node test/ports/questionnaire-oracle.ts http://localhost:4000
import { writeFile } from 'node:fs/promises';
import type { Page } from 'playwright';

export type Action =
	| { readonly kind: 'click'; readonly slot: 'questionnaire-next' | 'questionnaire-previous' | 'questionnaire-skip' | 'questionnaire-submit' }
	| { readonly kind: 'choose'; readonly nth: number }
	| { readonly kind: 'key'; readonly key: string; readonly on: 'item' | 'focused' }
	| { readonly kind: 'type'; readonly text: string };

export const SCRIPT: readonly Action[] = [
	{ kind: 'click', slot: 'questionnaire-next' },
	{ kind: 'click', slot: 'questionnaire-submit' },
	{ kind: 'key', key: 'b', on: 'item' },
	{ kind: 'key', key: 'ArrowDown', on: 'focused' },
	{ kind: 'choose', nth: 0 },
	{ kind: 'type', text: 'Ship it' },
	{ kind: 'click', slot: 'questionnaire-next' },
	{ kind: 'click', slot: 'questionnaire-skip' },
	{ kind: 'click', slot: 'questionnaire-previous' },
	{ kind: 'key', key: 'ArrowRight', on: 'item' },
	{ kind: 'choose', nth: 1 },
	{ kind: 'choose', nth: 1 },
	{ kind: 'key', key: 'Enter', on: 'focused' },
	{ kind: 'key', key: 'Meta+Enter', on: 'item' },
	{ kind: 'key', key: 'ArrowLeft', on: 'item' },
];

export interface Step {
	readonly action: string;
	readonly markup: readonly string[];
	readonly focus: string;
}

export interface Demo {
	readonly route: string;
	readonly index: number;
	readonly html: string;
	readonly steps: readonly Step[];
}

// Runs in the page: each element of the form with its attributes in name order and its live properties, and where focus is.
export function snapshot(index: number): { markup: string[]; focus: string } {
	const form = document.querySelectorAll('form[data-slot="questionnaire"]')[index]!;
	const all = [form, ...form.querySelectorAll('*')];
	const markup = all.map((el) => {
		const attrs = [...el.attributes]
			.filter((a) => a.name !== 'class' && a.name !== 'style')
			.map((a) => `${a.name}=${a.value}`)
			.sort();
		const live = el instanceof HTMLInputElement ? [`.checked=${el.checked}`, `.value=${el.value}`, `.required=${el.required}`] : [];
		const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
		return `${el.tagName.toLowerCase()} ${[...attrs, ...live].join(' ')}${text ? ` "${text}"` : ''}`;
	});
	const active = document.activeElement;
	return { markup, focus: active && form.contains(active) ? String(all.indexOf(active)) : 'outside' };
}

export const describe = (a: Action) => (a.kind === 'click' ? `click ${a.slot}` : a.kind === 'choose' ? `choose ${a.nth}` : a.kind === 'key' ? `key ${a.key} on ${a.on}` : `type ${a.text}`);

/** Does one step to the index-th questionnaire of the page. */
export async function perform(page: Page, index: number, action: Action): Promise<void> {
	const form = page.locator('form[data-slot="questionnaire"]').nth(index);
	const active = form.locator('[data-slot="questionnaire-item"]:not([hidden])').first();
	if (action.kind === 'click') {
		const button = form.locator(`[data-slot="${action.slot}"]:not([hidden])`).first();
		if ((await button.count()) && (await button.isEnabled())) await button.click({ timeout: 3000 });
	} else if (action.kind === 'choose') {
		const choice = active.locator('input[data-slot="questionnaire-choice-input"]').nth(action.nth);
		if ((await choice.count()) && (await choice.isEnabled())) await choice.click({ timeout: 3000 });
	} else if (action.kind === 'type') {
		const input = active.locator('[data-slot="questionnaire-input"]').first();
		if ((await input.count()) && (await input.isEnabled())) await input.pressSequentially(action.text);
	} else {
		if (action.on === 'item' && (await active.count())) await active.focus();
		await page.keyboard.press(action.key);
	}
	await page.waitForTimeout(50);
}

if (import.meta.main) {
	const { chromium } = await import('playwright');
	const old = process.argv[2] ?? 'http://localhost:4000';
	const routes = ['/docs/components/base/questionnaire'];
	const browser = await chromium.launch();
	const demos: Demo[] = [];
	try {
		for (const route of routes) {
			const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			await page.goto(`${old}${route}`, { waitUntil: 'load' });
			const count = await page.locator('form[data-slot="questionnaire"]').count();
			for (let index = 0; index < count; index++) {
				await page.goto(`${old}${route}`, { waitUntil: 'load' });
				// Hydrated: the library names each item's description in aria-describedby only once it runs.
				await page.waitForFunction(() => document.querySelector('[data-slot="questionnaire-item"][aria-describedby]'));
				await page.waitForTimeout(500);
				if (!(await page.locator('form[data-slot="questionnaire"]').nth(index).isVisible())) continue;
				const html = await page.locator('form[data-slot="questionnaire"]').nth(index).evaluate((el) => el.outerHTML);
				const steps: Step[] = [];
				for (const action of SCRIPT) {
					await perform(page, index, action);
					steps.push({ action: describe(action), ...(await page.evaluate(snapshot, index)) });
				}
				demos.push({ route, index, html, steps });
			}
			await page.close();
		}
	} finally {
		await browser.close();
	}
	await writeFile(new URL('./questionnaire-oracle.json', import.meta.url), `${JSON.stringify(demos, null, '\t')}\n`);
	console.log(`recorded ${demos.length} questionnaires`);
}
