import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { lostWithin, missingReaction } from '../src/check/journeys-compare.ts';
import type { StepResult } from '../src/check/journeys.ts';
import { runCheck } from '../src/check/run.ts';

function serve(html: string): Promise<{ server: Server; origin: string }> {
	return new Promise((done) => {
		const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html));
		server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
	});
}

const DESKTOP = [{ name: 'desktop', width: 1280, height: 800, isMobile: false }];

async function check(oldHtml: string, newHtml: string) {
	const [old, next] = await Promise.all([serve(oldHtml), serve(newHtml)]);
	const browser = await chromium.launch();
	try {
		return (await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ['/'], viewports: DESKTOP, browser })).routes[0]!;
	} finally {
		await browser.close();
		old.server.close();
		next.server.close();
	}
}

// Feature labels that are no control (no click handler, no role) switch the preview when the pointer comes over them.
const labels = (listen: boolean) => `<!doctype html><html lang="en"><head><title>Features</title><style>.label { display: inline-block; padding: 8px; margin: 4px; border: 1px solid #ccc }</style></head><body><main><h1>Features</h1><div><span class="label">Fast builds</span><span class="label">Small bundles</span><span class="label">Typed routes</span></div><p id="preview">Point at a feature</p></main>${listen ? '<script>for (const l of document.querySelectorAll(".label")) l.addEventListener("mouseenter", () => { document.getElementById("preview").textContent = "Preview: " + l.textContent; });</script>' : ''}</body></html>`;

test('a part that is no control but changes the page when the pointer comes over it is pointed at, and a port without that hover is red', { timeout: 300_000 }, async () => {
	const route = await check(labels(true), labels(false));
	const hovers = route.failures.filter((f) => f.check.startsWith('point at each of the 3 parts that answer the pointer coming over them'));
	assert.ok(hovers.length, route.failures.map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
	assert.equal(hovers[0]!.dimension, 'behaviour');
	assert.match(hovers[0]!.expected, /Preview: Fast builds/);
});

const svg = (fill: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="${fill}"/></svg>`)}`;
// Tabs whose underline slides under the chosen one and whose panel shows that tab's picture; the port moves the underline but never swaps the picture.
const tabs = (swap: boolean) => `<!doctype html><html lang="en"><head><title>Tabs</title><style>body { margin: 0; font: 16px sans-serif } [role=tablist] { position: relative; display: flex; gap: 0; padding-bottom: 6px } [role=tab] { width: 120px; height: 32px; border: 0; background: #eee } #bar { position: absolute; left: 0; bottom: 0; width: 120px; height: 4px; background: #333; transition: none } img { display: block }</style></head><body><main><h1>Gallery</h1><div role="tablist" aria-label="Views"><button role="tab" aria-selected="true">Red</button><button role="tab" aria-selected="false">Blue</button><div id="bar"></div></div><div role="tabpanel" aria-label="Picture"><img alt="The view" src="${svg('#c33')}"></div></main><script>const pics = { Red: ${JSON.stringify(svg('#c33'))}, Blue: ${JSON.stringify(svg('#33c'))} }; document.querySelectorAll("[role=tab]").forEach((t, i) => t.addEventListener("click", () => { document.querySelectorAll("[role=tab]").forEach((o) => o.setAttribute("aria-selected", String(o === t))); document.getElementById("bar").style.transform = "translateX(" + i * 120 + "px)";${swap ? ' document.querySelector("img").src = pics[t.textContent];' : ''} }));</script></body></html>`;

test('a tab whose own state and underline change while the panel it drives stays as it was is red: the whole region the original changed is compared', { timeout: 300_000 }, async () => {
	const route = await check(tabs(true), tabs(false));
	const blue = route.failures.find((f) => f.dimension === 'behaviour' && /^click tab "Blue"/.test(f.check));
	assert.ok(blue, route.failures.map((f) => `${f.check}: ${f.expected} / ${f.actual}`).join('\n'));
	assert.match(blue.expected, /tabpanel "Picture"/);
	assert.match(blue.actual, /does not change tabpanel "Picture"|the view does not change at/);
});

const step = (regions: StepResult['reaction'] extends infer R ? (R extends { regions: infer B } ? B : never) : never): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, reaction: { regions, changes: [] } });

test('missingReaction: a change that only reaches into the region the original changed does not answer it; one of its size elsewhere still does', () => {
	const panel = { x: 0, y: 96, width: 400, height: 256 };
	const underline = { x: 112, y: 128, width: 128, height: 16 };
	assert.deepEqual(missingReaction([step([panel]), step([panel])], step([underline])).regions, [panel]);
	assert.deepEqual(missingReaction([step([panel]), step([panel])], step([{ ...panel, y: 100 }])).regions, []);
	assert.deepEqual(missingReaction([step([panel]), step([panel])], step([{ x: 600, y: 96, width: 400, height: 256 }])).regions, []);
});

test('lostWithin: the original\'s main changed is answered by the port changing a region inside main; a panel the port leaves alone is not', () => {
	const at = (...affected: string[]): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, reaction: { regions: [], changes: [], affected } });
	assert.equal(lostWithin([at('main'), at('main')], at('listbox in main')), undefined);
	assert.deepEqual(lostWithin([at('tabpanel "Picture" in main'), at('tabpanel "Picture" in main')], at('tablist "Views" in main')), ['tabpanel "Picture" in main']);
	// The same list under another landmark is the landmark's difference (a11y), not this step's.
	assert.equal(lostWithin([at('list in navigation "Main"'), at('list in navigation "Main"')], at('list in banner')), undefined);
});
