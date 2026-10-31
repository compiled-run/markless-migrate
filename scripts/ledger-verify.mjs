// Checks each unanswered handler the ledger reports in a browser: the same gesture on the original and on the port, and what
// each side's gesture changed (its text, the address, storage, a download), to measure the ledger's false flags.
// node scripts/ledger-verify.mjs <jobs.json> <out.json> [old origin] [port origin]: both sides served (deploy/<site>/ci-serve.sh).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const [jobsFile, outFile, oldOrigin = 'http://localhost:4000', newOrigin = 'http://127.0.0.1:3000'] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const browser = await chromium.launch();

const squash = (s) => (s ?? '').replace(/\s+/g, '');

async function locate(page, loc) {
	return page.evaluateHandle((loc) => {
		const squash = (s) => (s ?? '').replace(/\s+/g, '');
		let sel = loc.tag ?? '*';
		if (loc.slot) sel += `[data-slot="${loc.slot}"]`;
		if (loc.label) sel += `[aria-label="${CSS.escape(loc.label)}"]`;
		if (loc.placeholder) sel += `[placeholder="${CSS.escape(loc.placeholder)}"]`;
		if (loc.role) sel += `[role="${loc.role}"]`;
		if (loc.id) sel += `#${CSS.escape(loc.id)}`;
		const all = [...document.querySelectorAll(sel)];
		const text = loc.text ?? '';
		const hits = all.filter((el) => !text || squash(el.textContent).includes(text.slice(0, 60)));
		if (loc.nth >= 0 && hits.length > loc.nth) return hits[loc.nth];
		return hits.find((el) => el.checkVisibility?.()) ?? hits[0] ?? null;
	}, loc);
}

async function state(page) {
	return page.evaluate(() => ({ lines: (document.body?.innerText ?? '').split('\n').map((l) => l.trim()).filter(Boolean), url: location.href, storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }), cookie: document.cookie, dialogs: document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu],[role=listbox],dialog[open]').length, value: (document.activeElement && 'value' in document.activeElement) ? String(document.activeElement.value) : '' }));
}

async function side(origin, job) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
	const page = await context.newPage();
	let downloads = 0;
	let pages = 0;
	page.on('download', () => downloads++);
	context.on('page', () => pages++);
	try {
		await page.goto(new URL(job.route, origin).href, { waitUntil: 'load', timeout: 45000 });
		await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
		await page.waitForTimeout(1200);
		await page.evaluate(() => {
			window.__mm_muts = 0;
			new MutationObserver((r) => (window.__mm_muts += r.length)).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
		});
		if (job.trigger) {
			const t = await locate(page, job.trigger);
			if (!(await t.evaluate((x) => !!x))) return { reached: false, why: 'trigger not found' };
			await t.asElement().click({ timeout: 3000 }).catch(() => t.asElement().click({ timeout: 3000, force: true }).catch(() => {}));
			await page.waitForTimeout(700);
		}
		const target = await locate(page, job.target);
		if (!(await target.evaluate((x) => !!x))) return { reached: false, why: 'target not found' };
		const el = target.asElement();
		await page.waitForTimeout(800);
		const idle0 = await page.evaluate(() => window.__mm_muts);
		await page.waitForTimeout(800);
		const idle = (await page.evaluate(() => window.__mm_muts)) - idle0;
		const before = await state(page);
		const muts0 = await page.evaluate(() => window.__mm_muts);
		const ev = job.event;
		try {
			if (ev === 'input') {
				await el.click({ timeout: 3000 }).catch(() => {});
				await page.keyboard.type('ab', { delay: 30 });
			} else if (ev === 'pointerover') await el.hover({ timeout: 3000 });
			else if (ev === 'focusout') {
				await el.click({ timeout: 3000 });
				await page.keyboard.type('a');
				await page.mouse.click(5, 5);
			} else if (ev === 'submit') {
				await el.evaluate((x) => (x.closest('form') ?? x.querySelector('form'))?.requestSubmit());
			} else if (ev === 'keydown') {
				await el.focus();
				await page.keyboard.press('Enter');
			} else {
				// A menu item, a select's option, a button: a real click; for an item in a layer, its first item.
				const inner = await el.evaluateHandle((x) => (x.matches('[role=menu],[role=listbox],[role=group],[role=radiogroup]') ? x.querySelector('[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox],[role=option],[role=radio]') ?? x : x));
				await inner.asElement().click({ timeout: 3000 }).catch(() => inner.asElement().click({ timeout: 3000, force: true }));
			}
		} catch (error) {
			return { reached: false, why: `gesture failed: ${String(error).split('\n')[0].slice(0, 120)}` };
		}
		await page.waitForTimeout(1000);
		const after = await state(page);
		const muts = (await page.evaluate(() => window.__mm_muts)) - muts0;
		const added = after.lines.filter((l) => !before.lines.includes(l));
		const removed = before.lines.filter((l) => !after.lines.includes(l));
		const reacted = added.length > 0 || removed.length > 0 || after.url !== before.url || after.storage !== before.storage || after.cookie !== before.cookie || after.dialogs !== before.dialogs || downloads > 0 || pages > 0 || muts > idle * 1.6 + 2;
		return { reached: true, reacted, added: added.slice(0, 40), removed: removed.slice(0, 40), newUrl: after.url !== before.url ? new URL(after.url).pathname + new URL(after.url).search : undefined, muts, idle, url: after.url !== before.url, storage: after.storage !== before.storage, dialogs: after.dialogs - before.dialogs, downloads, pages };
	} catch (error) {
		return { reached: false, why: String(error).split('\n')[0].slice(0, 160) };
	} finally {
		await context.close().catch(() => {});
	}
}

const out = [];
for (const job of jobs) {
	const old = await side(oldOrigin, job);
	const port = await side(newOrigin, job);
	// What the original's gesture changed that the port's did not: text it showed or took away, the address, storage, a file.
	const missing = old.reached && port.reached ? [...old.added.filter((l) => !port.added.includes(l)).map((l) => `+${l}`), ...old.removed.filter((l) => !port.removed.includes(l)).map((l) => `-${l}`), ...(old.newUrl && old.newUrl !== port.newUrl ? [`url ${old.newUrl}`] : []), ...(old.storage && !port.storage ? ['storage'] : []), ...(old.downloads && !port.downloads ? ['download'] : [])] : [];
	const verdict = !old.reached || !port.reached ? 'not reached' : !old.reacted ? 'original shows nothing' : !port.reacted ? 'port dead (real)' : missing.length ? 'port misses part of it (real)' : 'port does the same (ledger false flag)';
	out.push({ ...job, old, port, verdict, missing: missing.slice(0, 12) });
	console.log(`${verdict} | ${missing.slice(0, 3).join(' / ').slice(0, 80)} | ${job.route} | ${job.target.slot ?? job.target.tag} ${JSON.stringify(job.target.label ?? job.target.text)} | ${job.sites[0]}`);
}
writeFileSync(outFile, JSON.stringify(out, null, 1));
const count = {};
for (const r of out) count[r.verdict] = (count[r.verdict] ?? 0) + 1;
console.log(JSON.stringify(count));
await browser.close();
