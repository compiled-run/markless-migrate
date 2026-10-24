// Records activating an embed's Markless component on a live page: a video of the click, then what loaded in its
// place, whether it plays, and which page it opened. node deploy/embeds/record.ts <url> <embed id> <out dir>
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [url, id, out] = process.argv.slice(2);
if (!url || !id || !out) throw new Error('usage: record.ts <url> <embed id> <out dir>');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: out, size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const opened: string[] = [];
context.on('page', (popup) => {
	if (popup !== page) void popup.waitForLoadState('domcontentloaded').then(() => opened.push(popup.url()));
});
const requests: string[] = [];
page.on('request', (r) => requests.push(r.url()));
await page.goto(url, { waitUntil: 'load' });
const embed = page.locator(`[data-markless-embed="${id}"]`).first();
await embed.scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
const before = { requestsToProviders: requests.filter((u) => !u.startsWith(new URL(url).origin)).length, frames: await embed.locator('iframe').count() };
await embed.screenshot({ path: join(out, `${id}-before-click.png`) });
const box = (await embed.boundingBox())!;
const loadedBefore = requests.length;
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(8000);
const frame = page.frames().find((f) => f !== page.mainFrame() && embed && f.url().startsWith('http'));
const playing = frame ? await frame.evaluate(() => [...document.querySelectorAll('video, audio')].some((m) => !(m as HTMLMediaElement).paused && (m as HTMLMediaElement).currentTime > 0)).catch(() => false) : false;
const currentTime = frame ? await frame.evaluate(() => (document.querySelector('video') as HTMLVideoElement | null)?.currentTime ?? null).catch(() => null) : null;
await embed.screenshot({ path: join(out, `${id}-after-click.png`) }).catch(() => page.screenshot({ path: join(out, `${id}-after-click.png`) }));
const result = { url, id, before, after: { frames: page.frames().filter((f) => f !== page.mainFrame()).map((f) => f.url()), playing, currentTime, opened, requestsAfterClick: requests.length - loadedBefore } };
await context.close();
const video = await page.video()?.path();
if (video) await rename(video, join(out, `${id}-activation.webm`));
await browser.close();
await writeFile(join(out, `${id}-activation.json`), `${JSON.stringify(result, null, '\t')}\n`);
console.log(JSON.stringify(result));
