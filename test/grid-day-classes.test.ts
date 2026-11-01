// A calendar's day buttons are one class per state: any month, and the same calendar in another locale, are exercised by
// their first two days, and the rest are covered as alike rather than left unexercised when the budget runs out.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { defaultEnv } from '../src/check/browser.ts';
import { explore } from '../src/check/journeys.ts';

const month = (locale: string, dir: string) => {
	const days = Array.from({ length: 28 }, (_, i) => new Date(Date.UTC(2026, 1, i + 1)));
	const name = (d: Date) => d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
	const rows = Array.from({ length: 4 }, (_, r) => `<tr>${days.slice(r * 7, r * 7 + 7).map((d, i) => `<td role="gridcell"${r === 1 && i === 3 ? ' data-today="true"' : ''}><button type="button" onclick="this.closest('section').querySelector('output').textContent=this.textContent">${d.getUTCDate()}</button></td>`).join('')}</tr>`).join('');
	return `<section dir="${dir}"><table role="grid" data-slot="calendar">${rows}</table><output></output></section>`.replace(/<button type="button"/g, (m, offset) => m).replace(/>(\d+)<\/button>/g, (_, day) => ` aria-label="${name(days[Number(day) - 1]!)}">${day}</button>`);
};
const html = `<!doctype html><html lang="en"><title>Dates</title><main><h1>Dates</h1>${month('en-US', 'ltr')}${month('ar', 'rtl')}</main>`;

test("a calendar's day buttons are sampled per state across months and locales, and none is left unexercised", async () => {
	const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const browser = await chromium.launch();
	try {
		const x = await explore(browser, defaultEnv(`http://127.0.0.1:${(server.address() as AddressInfo).port}`), '/', { name: 'desktop', width: 1280, height: 800, isMobile: false }, { maxJourneys: 60 });
		const used = new Set(x.journeys.flatMap((j) => j.steps.filter((s) => s.target.role === 'button').map((s) => s.target.name)));
		assert.equal(used.size, 4, [...used].join(' | '));
		assert.ok(x.elements.some((e) => /more buttons in the cells of grids of the same kind/.test(e.element) && e.by?.startsWith('alike')), JSON.stringify(x.elements.map((e) => e.element)));
		assert.deepEqual(x.elements.filter((e) => !e.by && !e.shared && /button/.test(e.element)).map((e) => `${e.element}: ${e.reason}`), []);
	} finally {
		await browser.close();
		server.close();
	}
});
