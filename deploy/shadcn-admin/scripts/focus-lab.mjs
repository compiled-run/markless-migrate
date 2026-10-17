// Runs steps on a page and reports focus, aria-hidden and a snippet after each: node focus-lab.mjs <url> '<steps json>'
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
for (const s of JSON.parse(process.argv[3])) {
	if (s.click) await p.click(s.click);
	if (s.press) await p.keyboard.press(s.press);
	if (s.focus) await p.focus(s.focus);
	await p.waitForTimeout(s.wait ?? 250);
	console.log(JSON.stringify(s), '=>', await p.evaluate((sel) => ({ focus: document.activeElement?.outerHTML.slice(0, 90), hidden: [...document.querySelectorAll('[aria-hidden=true][data-aria-hidden]')].map((e) => e.tagName + '#' + e.id), read: sel ? [...document.querySelectorAll(sel)].map((e) => e.outerHTML.slice(0, 160)) : [] }), s.read));
}
console.log((await p.locator('body').ariaSnapshot()).slice(0, 600));
await b.close();
