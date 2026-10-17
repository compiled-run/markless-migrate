// Prints the live state of the alpinejs.dev homepage step tabs and panels: node deploy/alpinejs-dev/home-live.mjs <origin>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.route(/carbonads|usefathom|cloudflareinsights/, (r) => r.abort());
await p.goto(process.argv[2] + '/', { waitUntil: 'load' }); await p.waitForTimeout(1000);
const dump = () => p.evaluate(() => {
	const tabs = [...document.querySelectorAll('.flex.justify-center.space-x-2.pt-16 > *')].map((e) => e.outerHTML.replace(/\s+/g, ' ').slice(0, 300));
	const box = document.querySelector('.relative.m-auto.px-8.text-gray-800');
	const panels = [...box.querySelectorAll(':scope > div:nth-child(2) > div')].map((d) => `${d.getAttribute('style')} | ${d.className} | ${d.textContent.trim().slice(0, 30)}`);
	return { tabs, boxClass: box.className, overlay: box.firstElementChild.outerHTML.slice(0, 160), panels };
});
console.log(JSON.stringify(await dump(), null, 1));
await p.getByRole('button', { name: /Properties/ }).click(); await p.waitForTimeout(50);
console.log(JSON.stringify((await dump()).panels)); await p.waitForTimeout(600); console.log(JSON.stringify((await dump()).panels), JSON.stringify((await dump()).tabs));
await b.close();
