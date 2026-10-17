// Prints each .demo block's live state on an alpinejs.dev page: node deploy/alpinejs-dev/demo-state.mjs <url>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
await p.route(/usefathom|carbonads|doubleclick|cloudflareinsights/, (r) => r.abort());
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
const out = await p.evaluate(() => [...document.querySelectorAll('.demo')].map((d) => ({
	html: d.innerHTML.replace(/\s+/g, ' ').slice(0, 600),
	fields: [...d.querySelectorAll('input,select,textarea')].map((f) => ({ tag: f.tagName, type: f.type, value: f.value, checked: f.checked, selectedIndex: f.selectedIndex, selected: f.selectedOptions ? [...f.selectedOptions].map((o) => o.value) : undefined })),
	text: d.innerText,
})));
for (const [i, d] of out.entries()) console.log(i, JSON.stringify(d));
await b.close();
