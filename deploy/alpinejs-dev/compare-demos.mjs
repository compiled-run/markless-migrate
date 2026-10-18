// Drives every live example on a docs page on the old and the new site the same way and prints where their DOM differs:
// node deploy/alpinejs-dev/compare-demos.mjs <old-origin> <new-origin> <route>...
import { chromium } from 'playwright';

const [oldOrigin, newOrigin, ...routes] = process.argv.slice(2);
const browser = await chromium.launch();

const normalize = () => {
	const clean = (node) => {
		for (const child of [...node.childNodes]) {
			if (child.nodeType === 8 || (child.nodeType === 1 && (child.tagName === 'SCRIPT' || child.tagName === 'STYLE'))) child.remove();
			else if (child.nodeType === 1) {
				for (const a of [...child.attributes]) {
					// Field state is compared from the live values below; the attributes only say how each side set it.
					if (/^(x-|@|:|wire:|data-teleport)/.test(a.name) || ['value', 'selected', 'checked'].includes(a.name)) child.removeAttribute(a.name);
				}
				if (child.getAttribute('style') !== null) {
					const s = child.getAttribute('style').split(';').map((d) => d.trim()).filter(Boolean).sort().join('; ');
					if (s) child.setAttribute('style', s);
					else child.removeAttribute('style');
				}
				if (child.getAttribute('class') !== null) child.setAttribute('class', child.getAttribute('class').split(/\s+/).filter(Boolean).sort().join(' '));
				if (child.tagName === 'TEMPLATE') child.innerHTML = '';
				else clean(child);
			}
		}
	};
	const demos = [...document.querySelectorAll('.markdown > div, .markdown > ul.flex')];
	return demos.map((d) => {
		const holder = document.createElement('div');
		holder.append(d.cloneNode(true));
		clean(holder);
		const copy = holder.firstChild;
		const values = [...d.querySelectorAll('input, select, textarea')].map((f) => (f.type === 'checkbox' || f.type === 'radio' ? f.checked : f.multiple ? [...f.selectedOptions].map((o) => o.value).join('|') : f.value));
		const visible = [...d.querySelectorAll('*')].filter((e) => e.checkVisibility?.()).length;
		return `${copy.outerHTML.replace(/\s+/g, ' ').replace(/> /g, '>').replace(/ </g, '<')} values=${JSON.stringify(values)} visible=${visible} focus=${d.contains(document.activeElement) ? document.activeElement.tagName + (document.activeElement.textContent || '').trim().slice(0, 20) : '-'}`;
	});
};

async function open(origin, route) {
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.on('dialog', (d) => {
		page.dialogs.push(d.message());
		void d.dismiss();
	});
	page.dialogs = [];
	page.on('pageerror', (e) => page.errors.push(e.message));
	page.errors = [];
	await page.route(/carbonads|usefathom|buysellads|cloudflareinsights|doubleclick|srv\.carbon/, (r) => r.abort());
	await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(1500);
	return page;
}

let differences = 0;
const VERBOSE = process.env.VERBOSE;
for (const route of routes) {
	const [a, b] = [await open(oldOrigin, route), await open(newOrigin, route)];
	const report = (label, x, y) => {
		for (let i = 0; i < Math.max(x.length, y.length); i++) {
			if (x[i] !== y[i]) {
				differences++;
				console.log(`${route} ${label} demo ${i}\n  old: ${(x[i] ?? '(none)').slice(0, 900)}\n  new: ${(y[i] ?? '(none)').slice(0, 900)}`);
			}
		}
	};
	const loadOld = await a.evaluate(normalize);
	if (VERBOSE) console.log(loadOld.join("\n"));
	report("load", loadOld, await b.evaluate(normalize));
	const controls = await a.evaluate(() => [...document.querySelectorAll('.markdown > div, .markdown > ul.flex')].map((d, i) => [...d.querySelectorAll('button, input, select, textarea, a[href="#"]')].map((c, j) => [i, j, c.tagName, c.type || ''])).flat());
	for (const [i, j, tag, type] of controls) {
		const act = async (page) => {
			const control = page.locator('.markdown > div, .markdown > ul.flex').nth(i).locator('button, input, select, textarea, a[href="#"]').nth(j);
			try {
				if (!(await control.isVisible())) return 'hidden';
				if (tag === 'SELECT') {
					const options = await control.locator('option').allTextContents();
					await control.selectOption({ index: Math.min(2, options.length - 1) });
				} else if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'range'].includes(type))) {
					await control.click();
					await page.keyboard.type('34a1234567');
					await page.keyboard.press('Enter');
				} else if (type === 'range') await control.fill('0.8');
				else await control.click();
			} catch (error) {
				return `failed: ${String(error.message).split('\n')[0]}`;
			}
			await page.waitForTimeout(1200);
			return 'ok';
		};
		const [ra, rb] = [await act(a), await act(b)];
		const label = `after ${tag.toLowerCase()} ${j} of demo ${i} (${ra}/${rb})`;
		report(label, await a.evaluate(normalize), await b.evaluate(normalize));
		if (JSON.stringify(a.dialogs) !== JSON.stringify(b.dialogs)) console.log(`${route} ${label} dialogs old ${JSON.stringify(a.dialogs)} new ${JSON.stringify(b.dialogs)}`);
	}
	if (b.errors.length) console.log(`${route} new page errors: ${b.errors.join(' | ')}`);
	await a.close();
	await b.close();
}
console.log(`${differences} differences`);
await browser.close();
