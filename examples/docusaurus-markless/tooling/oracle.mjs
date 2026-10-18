// Saves what the old site renders for each sitemap route (desktop, light mode, after its scripts ran) into
// tooling/.oracle/, so the importer's output can be compared with it offline: `node tooling/oracle.mjs [origin]`.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '../../../node_modules/playwright/index.mjs';

const origin = (process.argv[2] ?? 'http://127.0.0.1:4201').replace(/\/$/, '');
const only = process.argv.slice(3);
const out = join(import.meta.dirname, '.oracle');
await mkdir(out, { recursive: true });
const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
const routes = only.length ? only : [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const browser = await chromium.launch();
const file = (path) => join(out, `${encodeURIComponent(path)}.json`);
let next = 0;
async function worker() {
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
	while (next < routes.length) {
		const path = routes[next++];
		const page = await context.newPage();
		try {
			// The home page keeps loading (a looping video), so it never goes network-idle.
			await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.waitForTimeout(3000));
			await page.waitForTimeout(300);
			const data = await page.evaluate(() => ({
				status: 200,
				title: document.title,
				h1: document.querySelector('h1')?.textContent ?? null,
				html: Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value])),
				head: [...document.head.children].map((el) => el.outerHTML),
				body: document.getElementById('__docusaurus')?.outerHTML ?? document.body.outerHTML,
			}));
			await writeFile(file(path), JSON.stringify({ path, ...data }));
		} catch (error) {
			process.stderr.write(`${path}: ${error.message}\n`);
		}
		await page.close();
	}
	await context.close();
}
await Promise.all(Array.from({ length: 6 }, worker));
await browser.close();
process.stdout.write(`${routes.length} routes -> ${out}\n`);
