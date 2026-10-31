// Loads the same page from two builds and compares every element's computed style, element by element in document order.
import { chromium } from 'playwright';

const [left, right] = process.argv.slice(2);
const hosts = [left, right].map((url) => new URL(url).hostname);
const browser = await chromium.launch({
	args: ['--ignore-certificate-errors', `--host-resolver-rules=${hosts.map((host) => `MAP ${host} 127.0.0.1`).join(',')}`],
});
const snapshot = async (url) => {
	const page = await browser.newPage({ viewport: { width: 1350, height: 940 }, ignoreHTTPSErrors: true });
	const stylesheets = [];
	page.on('request', (request) => request.resourceType() === 'stylesheet' && stylesheets.push(request.url()));
	await page.goto(url, { waitUntil: 'networkidle' });
	const styles = await page.evaluate(() =>
		[...document.body.querySelectorAll('*')].map((element) => {
			const style = getComputedStyle(element);
			return [element.localName, [...style].map((name) => `${name}:${style.getPropertyValue(name)}`).join(';')];
		}),
	);
	const head = await page.evaluate(() => ({
		links: document.querySelectorAll('link[rel="stylesheet"]').length,
		inline: document.querySelectorAll('style[data-markless-css]').length,
	}));
	await page.close();
	return { styles, stylesheets, head };
};
const a = await snapshot(left);
const b = await snapshot(right);
let differing = 0;
const examples = [];
for (let index = 0; index < Math.max(a.styles.length, b.styles.length); index++) {
	const [tagA, styleA] = a.styles[index] ?? [];
	const [tagB, styleB] = b.styles[index] ?? [];
	if (tagA === tagB && styleA === styleB) continue;
	differing++;
	if (examples.length < 5) {
		const propsA = new Map((styleA ?? '').split(';').map((pair) => pair.split(/:(.*)/s)));
		const changed = (styleB ?? '').split(';').map((pair) => pair.split(/:(.*)/s)).filter(([name, value]) => propsA.get(name) !== value);
		examples.push({ index, tagA, tagB, changed: changed.slice(0, 6) });
	}
}
console.log(JSON.stringify({ elements: [a.styles.length, b.styles.length], differing, examples, stylesheetRequests: [a.stylesheets.length, b.stylesheets.length], head: [a.head, b.head] }, null, 1));
await browser.close();
