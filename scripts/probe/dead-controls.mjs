// Dead-control inventory: every visible control of a route used once on the original and on the port, from a fresh load;
// what it changes outside itself (by region), whether it moves the address, what a click at its centre reaches, and how the
// popup it opens first shows. Usage: node dead-controls.mjs <routes-file> <out.jsonl> [shard index] [shard count]
import { chromium, webkit } from 'playwright';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const OLD = process.env.OLD ?? 'https://mm-shadcn-ui-old.vercel.app';
const NEW = process.env.NEW ?? 'https://mm-shadcn-ui-new.vercel.app';
const BYPASS = process.env.BYPASS ?? '';
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS ?? 60);
const SETTLE = Number(process.env.SETTLE ?? 700);
const [routesFile, out, shardArg, countArg] = process.argv.slice(2);
const all = JSON.parse(readFileSync(routesFile, 'utf8'));
const routes = (Array.isArray(all) ? all : Array.isArray(all.routes) ? all.routes : Object.keys(all.routes ?? all)).filter((r) => typeof r === 'string' && r.startsWith('/'));
const shard = Number(shardArg ?? 0), count = Number(countArg ?? 1);
const workers = Number(process.env.WORKERS ?? 1), worker = Number(process.env.WORKER ?? 0);
const mine = routes.filter((_, i) => i % count === shard).filter((_, i) => i % workers === worker);

// In the page: the visible controls, keyed by role, name and their index among namesakes.
function listControls() {
	const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=combobox], [role=slider], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=link], [role=treeitem]';
	const IMPLICIT = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', summary: 'button' };
	const roleOf = (el) => el.getAttribute('role') ?? (el.localName === 'input' ? ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', search: 'searchbox' }[el.type] ?? 'textbox') : IMPLICIT[el.localName] ?? el.localName);
	const nameOf = (el) => {
		const by = el.getAttribute('aria-labelledby');
		const n = el.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '') ?? '';
		return (n || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
	};
	const LAYOUT = 'header, nav, aside, footer, [role=banner], [role=navigation], [role=complementary], [role=contentinfo]';
	const seen = new Map();
	const out = [];
	for (const el of document.querySelectorAll(SEL)) {
		if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || el.closest('[hidden], [inert], [aria-hidden=true]')) continue;
		if (el.matches(':disabled, [aria-disabled=true]')) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) continue;
		const role = roleOf(el), name = nameOf(el);
		const k = `${role}|${name}`;
		const nth = seen.get(k) ?? 0;
		seen.set(k, nth + 1);
		const href = el.localName === 'a' ? el.getAttribute('href') : null;
		let leaves = false;
		if (href !== null) {
			try { const u = new URL(href, location.href); leaves = u.origin !== location.origin || u.pathname !== location.pathname || (u.hash !== '' && u.search === location.search); } catch { leaves = true; }
		}
		const frame = el.closest('[data-slot=preview], figure, section, [role=dialog], main') ?? document.body;
		const f = frame.getBoundingClientRect();
		const slot = el.closest('[data-slot]')?.getAttribute('data-slot') ?? '';
		out.push({ key: `${role} "${name}"${nth ? ` #${nth + 1}` : ''}`, role, name, nth, layout: Boolean(el.closest(LAYOUT)), leaves, box: { x: Math.round(r.x - f.x), y: Math.round(r.y - f.y), w: Math.round(r.width), h: Math.round(r.height) }, template: `${role}|${slot}`, type: el.type ?? '', options: el.localName === 'select' ? [...el.options].map((o) => o.value) : undefined, inDialog: Boolean(el.closest('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')) });
	}
	return out;
}

// In the page: find a control again by its key, mark it, and arm the observers for one use of it.
function arm(control) {
	const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=combobox], [role=slider], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=link], [role=treeitem]';
	const IMPLICIT = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', summary: 'button' };
	const roleOf = (el) => el.getAttribute('role') ?? (el.localName === 'input' ? ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', search: 'searchbox' }[el.type] ?? 'textbox') : IMPLICIT[el.localName] ?? el.localName);
	const nameOf = (el) => {
		const by = el.getAttribute('aria-labelledby');
		const n = el.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '') ?? '';
		return (n || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
	};
	const visible = [...document.querySelectorAll(SEL)].filter((el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !el.closest('[hidden], [inert], [aria-hidden=true]') && el.getBoundingClientRect().width >= 2);
	const same = visible.filter((el) => roleOf(el) === control.role && nameOf(el) === control.name);
	const el = same[control.nth];
	if (!el) return null;
	for (const o of document.querySelectorAll('[data-dc-used]')) o.removeAttribute('data-dc-used');
	el.setAttribute('data-dc-used', '');
	el.scrollIntoView({ block: 'center', inline: 'center' });
	const r = el.getBoundingClientRect();
	const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
	const hitEl = document.elementFromPoint(cx, cy);
	const owner = hitEl?.closest(SEL);
	const hit = !hitEl ? 'nothing' : owner === el || el.contains(hitEl) ? 'itself' : owner ? `${roleOf(owner)} "${nameOf(owner)}"` : `${hitEl.localName} (no control)`;
	const openBefore = new Set([...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=tooltip]')].filter((p) => p.checkVisibility()));
	const touched = new Set();
	// First value of each attribute the use changed: one set again to what it was (a framework re-render, a screenshot's empty style) is no change.
	const was = new Map();
	const observer = new MutationObserver((records) => {
		for (const rec of records) {
			if (rec.type === 'attributes') {
				if (rec.attributeName?.startsWith('data-dc-')) continue;
				const m = was.get(rec.target) ?? was.set(rec.target, new Map()).get(rec.target);
				if (!m.has(rec.attributeName)) m.set(rec.attributeName, rec.oldValue);
				continue;
			}
			touched.add(rec.target);
			if (rec.type === 'childList') for (const n of rec.addedNodes) touched.add(n);
		}
	});
	observer.observe(document, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
	// A same-origin frame (a live preview) changes in its own document.
	for (const frame of document.querySelectorAll('iframe')) {
		try { if (frame.contentDocument && frame.checkVisibility()) observer.observe(frame.contentDocument, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true }); } catch {}
	}
	const frames = [];
	const t0 = performance.now();
	let firstInput;
	addEventListener('pointerdown', (e) => { firstInput ??= performance.now(); }, { capture: true, once: true });
	addEventListener('keydown', (e) => { firstInput ??= performance.now(); }, { capture: true, once: true });
	const tick = () => {
		const now = performance.now();
		const popup = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')].find((p) => !openBefore.has(p) && p.checkVisibility());
		if (popup && firstInput !== undefined) {
			const cs = getComputedStyle(popup);
			frames.push({ ms: Math.round(now - firstInput), opacity: Number(cs.opacity), transform: cs.transform, anims: popup.getAnimations().map((a) => a.animationName ?? a.transitionProperty ?? 'animation') });
		}
		if (now - t0 < 1500 && frames.length < 30) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const url = location.pathname + location.search;
	globalThis.__dc = { observer, touched, was, frames, url, openBefore, el };
	return { hit, x: cx, y: cy };
}

// In the page: what the use changed outside the control and the pop-ups that were already open.
function read(prefix) {
	const st = globalThis.__dc;
	st.observer.disconnect();
	const IMPLICIT = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', dialog: 'dialog', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', aside: 'complementary', form: 'form', table: 'table', ul: 'list', ol: 'list', section: 'region', figure: 'figure' };
	const roleOf = (el) => el.getAttribute('role') ?? IMPLICIT[el.localName];
	const label = (el) => (el.getAttribute('aria-label') ?? (el.getAttribute('aria-labelledby') ? el.getAttribute('aria-labelledby').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '')).replace(/\s+/g, ' ').trim().slice(0, 40);
	const describe = (el) => `${roleOf(el) ?? el.localName}${label(el) ? ` "${label(el)}"` : ''}`;
	const REGION = /^(dialog|alertdialog|menu|listbox|list|table|grid|tree|tablist|tabpanel|region|form|figure|group|status|log|tooltip|main|navigation|complementary|banner|contentinfo|search)$/;
	const LANDMARK = /^(main|navigation|complementary|banner|contentinfo|search|dialog|alertdialog)$/;
	const heading = (el) => { for (let at = el; at && at !== document.body; at = at.parentElement) { for (let s = at.previousElementSibling; s; s = s.previousElementSibling) { const h = s.matches('h1,h2,h3,h4') ? s : s.querySelector?.('h1,h2,h3,h4:last-of-type'); if (h && /^h[1-4]$/.test(s.localName)) return h.textContent.replace(/#$/, '').trim().slice(0, 40); } } return ''; };
	const regionOf = (el) => {
		let region;
		for (let at = el; at && at !== document.body; at = at.parentElement) {
			const role = roleOf(at) ?? '';
			if (!region && REGION.test(role) && (role !== 'group' || label(at))) region = at;
			if (LANDMARK.test(role)) { const h = heading(el); return `${region && region !== at ? `${describe(region)} in ${describe(at)}` : describe(at)}${h ? ` under "${h}"` : ''}`; }
		}
		return region ? describe(region) : 'the page';
	};
	const skip = [st.el, ...st.openBefore, ...(prefix ?? []).map((sel) => document.querySelector(sel)).filter(Boolean)];
	const affected = new Set();
	const attrs = new Set([...st.was].filter(([el, m]) => [...m].some(([n, v]) => (n === 'style' ? (el.getAttribute(n) ?? '') !== (v ?? '') : el.getAttribute(n) !== v))).map(([el]) => el));
	for (const node of [...st.touched, ...attrs]) {
		const doc = node.ownerDocument ?? node;
		if (doc !== document) {
			const frame = [...document.querySelectorAll('iframe')].find((f) => { try { return f.contentDocument === doc; } catch { return false; } });
			if (frame) affected.add(`iframe${frame.title ? ` "${frame.title}"` : ''} in ${regionOf(frame)}`);
			continue;
		}
		const el = node instanceof Element ? node : node.parentElement;
		if (!el?.isConnected || el.closest('head')) continue;
		// The page's own colour mode or scroll lock is set on <html> or <body>; a pop-up put into <body> is named by itself.
		if (el === document.body || el === document.documentElement) { if (node === el && attrs.has(el)) affected.add('the page'); continue; }
		if (skip.some((s) => s && (s === el || s.contains(el)))) continue;
		if (!el.checkVisibility() && !el.parentElement?.checkVisibility()) continue;
		affected.add(regionOf(el));
	}
	const vis = st.frames;
	const first = vis[0];
	const shownPopup = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')].find((p) => !st.openBefore.has(p) && p.checkVisibility());
	let anchor;
	if (shownPopup && st.el.isConnected) {
		const t = st.el.getBoundingClientRect(), p = shownPopup.getBoundingClientRect();
		anchor = { side: p.top >= t.bottom - 2 ? 'below' : p.bottom <= t.top + 2 ? 'above' : p.left >= t.right - 2 ? 'right' : p.right <= t.left + 2 ? 'left' : 'over', dx: Math.round(p.left - t.left), dy: Math.round(p.top - t.bottom), w: Math.round(p.width), h: Math.round(p.height), tw: Math.round(t.width) };
	}
	return { affected: [...affected].sort().slice(0, 6), url: location.pathname + location.search !== st.url ? location.pathname + location.search : '', popup: first ? { firstMs: first.ms, opacity: Math.round(first.opacity * 100) / 100, transform: first.transform, anims: [...new Set(vis.flatMap((f) => f.anims))].sort(), ...(anchor ? { anchor } : {}) } : undefined };
}

const ENGINE = process.env.ENGINE ?? 'chromium';
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch();
const WIDTH = Number(process.env.WIDTH ?? 1280);
const STATIC_WIDTHS = (process.env.STATIC_WIDTHS ?? '1280,1440,390').split(',').map(Number);
const ANCHOR_WIDTHS = (process.env.ANCHOR_WIDTHS ?? '1440').split(',').filter(Boolean).map(Number);
// One context for both sides (different origins keep their own storage); the bypass header only goes to the port's host.
// Every use starts from a fresh context: what one use stored (a colour mode, a package manager, an intro dismissed) is not the next one's.
const pages = {};
const cdp = {};
let context;
async function fresh(width = WIDTH) {
	await context?.close().catch(() => {});
	context = await browser.newContext({ viewport: { width, height: 900 } });
	if (BYPASS) await context.route(`${NEW}/**`, (r) => r.continue({ headers: { ...r.request().headers(), 'x-vercel-protection-bypass': BYPASS } }));
	for (const side of ['old', 'new']) {
		pages[side] = await context.newPage();
		pages[side].on('dialog', (d) => d.dismiss().catch(() => {}));
		if (ENGINE === 'chromium') cdp[side] = await context.newCDPSession(pages[side]);
	}
}
const layoutDone = new Set();
const motionTemplates = new Set();
let motionMs = 0;
const STRIPS = process.env.STRIPS ?? '';

async function load(side, route) {
	const p = pages[side];
	// A tab in the background gets no animation frames: the side in use is always the one in front.
	await p.bringToFront();
	await p.goto((side === 'old' ? OLD : NEW) + route, { waitUntil: 'load', timeout: 45_000 });
	await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
	await p.waitForTimeout(300);
}

// Every frame the compositor paints while the use runs (a screencast only sends a frame when the picture changed): CSS, script, SVG and canvas motion alike.
async function filmed(side, run) {
	const session = cdp[side];
	const frames = [];
	const onFrame = (f) => {
		frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
		session.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
	};
	session.on('Page.screencastFrame', onFrame);
	await session.send('Page.startScreencast', { format: 'png', maxWidth: 480, maxHeight: 340, everyNthFrame: 1 });
	await sleep(120);
	const start = Date.now() / 1;
	const base = frames.length;
	const result = await run();
	// Keep filming while frames still come (a stream, a long morph), up to 3 s.
	let last = frames.length;
	for (let waited = 0; waited < 3000; waited += 250) {
		await sleep(250);
		if (frames.length === last && waited >= 500) break;
		last = frames.length;
	}
	await session.send('Page.stopScreencast').catch(() => {});
	session.off('Page.screencastFrame', onFrame);
	return { result, frames: frames.slice(Math.max(0, base - 1)), start };
}

function motionOf(frames) {
	const imgs = frames.map((f) => ({ t: f.t, png: PNG.sync.read(Buffer.from(f.data, 'base64')) })).filter((f) => f.png.width);
	if (imgs.length < 2) return { distinct: 0, durationMs: 0, maxGapMs: 0, imgs };
	const differs = (a, b) => a.width === b.width && a.height === b.height ? pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 }) > a.width * a.height * 0.0005 : true;
	const distinct = [imgs[0]];
	for (const f of imgs.slice(1)) if (differs(distinct.at(-1).png, f.png)) distinct.push(f);
	const end = distinct.at(-1);
	const changes = distinct.slice(1);
	const gaps = changes.slice(1).map((f, i) => f.t - changes[i].t);
	return { distinct: changes.length, durationMs: changes.length ? Math.round(end.t - changes[0].t) : 0, maxGapMs: gaps.length ? Math.round(Math.max(...gaps)) : 0, medianGapMs: gaps.length ? Math.round(gaps.sort((a, b) => a - b)[gaps.length >> 1]) : 0, imgs: distinct };
}

function strip(file, old, port) {
	const pick = (imgs) => { const n = Math.min(8, imgs.length); return Array.from({ length: n }, (_, i) => imgs[Math.round((i * (imgs.length - 1)) / Math.max(1, n - 1))].png); };
	const rows = [pick(old), pick(port)];
	const w = Math.max(...rows.flat().map((p) => p.width)), h = Math.max(...rows.flat().map((p) => p.height));
	const outPng = new PNG({ width: w * 8, height: h * 2 });
	outPng.data.fill(255);
	rows.forEach((row, r) => row.forEach((p, c) => PNG.bitblt(p, outPng, 0, 0, p.width, p.height, c * w, r * h)));
	writeFileSync(file, PNG.sync.write(outPng));
}

async function use(side, route, prefix, control, film, width = WIDTH) {
	if (side === 'old') await fresh(width);
	const p = pages[side];
	await load(side, route);
	for (const step of prefix) {
		const armed = await p.evaluate(arm, step).catch(() => null);
		// A step the page remembers having taken (an intro dismissed for good) is not offered again.
		if (!armed) continue;
		await act(p, step).catch(() => {});
		await p.waitForTimeout(SETTLE);
		await p.evaluate(read, []).catch(() => null);
		await p.evaluate(() => { const el = document.querySelector('[data-dc-used]'); el?.setAttribute('data-dc-prefix', ''); el?.removeAttribute('data-dc-used'); });
	}
	const armed = await p.evaluate(arm, control).catch((e) => ({ error: e.message }));
	if (!armed) return { missing: 'not on the page' };
	if (armed.error) return { missing: armed.error.split('\n')[0] };
	let film_;
	try {
		if (film) {
			const t0 = Date.now();
			film_ = await filmed(side, () => act(p, control));
			motionMs += Date.now() - t0;
		} else await act(p, control);
	} catch (e) {
		return { hit: armed.hit, failed: e.message.split('\n')[0].slice(0, 160) };
	}
	await p.waitForTimeout(SETTLE);
	const r = await p.evaluate(read, ['[data-dc-prefix]']).catch((e) => ({ error: e.message }));
	const opened = await p.evaluate(listControls).catch(() => []);
	return { hit: armed.hit, ...r, opened, ...(film_ ? { motion: motionOf(film_.frames) } : {}) };
}

async function act(p, c) {
	const loc = p.locator('[data-dc-used]').first();
	if (c.role === 'textbox' || c.role === 'searchbox') return loc.fill('zq', { timeout: 3000 });
	if (c.options) return loc.selectOption(c.options[1] ?? c.options[0], { timeout: 3000 });
	if (c.role === 'slider') { await loc.focus({ timeout: 3000 }); return p.keyboard.press('ArrowRight'); }
	return loc.click({ timeout: 3000 });
}

const changed = (r) => Boolean(r && (r.affected?.length || r.url || r.popup || r.motion?.distinct > 0));
const leftPage = (r, route) => Boolean(r.url && r.url.split('?')[0] !== route.split('?')[0]);
const transformMoves = (t) => t !== 'none' && !/^matrix\(1, 0, 0, 1, 0, -?[\d.e-]+\)$/.test(t);

for (const route of mine) {
	const findings = [];
	let tried = 0;
	const started = Date.now();
	try {
		// What each width shows: every control of the page's own content on the original, its size and place in its example frame, on the port.
		let controls = [];
		for (const width of STATIC_WIDTHS) {
			await fresh(width);
			await load('old', route);
			const olds = await pages.old.evaluate(listControls);
			await load('new', route);
			const news = await pages.new.evaluate(listControls).catch(() => []);
			if (width === WIDTH) controls = olds.filter((c) => !c.leaves);
			const portByKey = new Map(news.map((c) => [c.key, c]));
			let boxes = 0, missing = 0;
			for (const c of olds) {
				if (c.layout) continue;
				const n = portByKey.get(c.key);
				if (!n) {
					if (missing++ < 10) findings.push({ route, control: c.key, kind: 'missing-at-width', width, expected: `shown at ${width} px wide`, actual: 'not on the port at this width' });
					continue;
				}
				const d = { w: n.box.w - c.box.w, h: n.box.h - c.box.h, x: n.box.x - c.box.x, y: n.box.y - c.box.y };
				if ((Math.abs(d.w) > 3 || Math.abs(d.h) > 3 || Math.abs(d.x) > 4 || Math.abs(d.y) > 4) && boxes++ < 20) findings.push({ route, control: c.key, kind: 'box', width, expected: `${c.box.w}x${c.box.h} at (${c.box.x}, ${c.box.y}) in its frame`, actual: `${n.box.w}x${n.box.h} at (${n.box.x}, ${n.box.y})` });
			}
		}
		const popups = [];
		const perName = new Map();
		const queue = controls
			.filter((c) => !(c.layout && layoutDone.has(c.key)))
			.filter((c) => { const n = (perName.get(`${c.role}|${c.name}`) ?? 0) + 1; perName.set(`${c.role}|${c.name}`, n); return n <= 2; })
			.map((c) => ({ prefix: [], control: c }));
		for (const c of controls) if (c.layout) layoutDone.add(c.key);
		const done = new Set();
		const deadIds = new Map();
		while (queue.length && tried < MAX_ACTIONS) {
			const { prefix, control } = queue.shift();
			const id = [...prefix.map((s) => s.key), control.key].join(' > ');
			if (process.env.ONLY && !new RegExp(process.env.ONLY).test(id)) continue;
			if (done.has(id)) continue;
			done.add(id);
			// What lies behind a control that is dead on the port is counted under it, not listed again.
			const blockedBy = [...deadIds.keys()].find((d) => id.startsWith(`${d} > `));
			if (blockedBy) { deadIds.get(blockedBy).behind++; continue; }
			tried++;
			const film = ENGINE === 'chromium' && !motionTemplates.has(control.template);
			const old = await use('old', route, prefix, control, film).catch((e) => ({ failed: e.message.split('\n')[0] }));
			if (old.failed || leftPage(old, route) || !changed(old)) continue;
			if (film) motionTemplates.add(control.template);
			const port = await use('new', route, prefix, control, film).catch((e) => ({ failed: e.message.split('\n')[0] }));
			if (process.env.DEBUG) console.log('  ', id, '\n     old', JSON.stringify({ ...old, opened: old.opened?.length, motion: old.motion && { ...old.motion, imgs: old.motion.imgs.length } }), '\n     new', JSON.stringify({ ...port, opened: port.opened?.length, motion: port.motion && { ...port.motion, imgs: port.motion.imgs.length } }));
			const base = { route, control: id };
			if (port.missing || port.failed) findings.push({ ...base, kind: 'unusable', expected: describe(old), actual: port.missing ?? port.failed });
			else if (!changed(port)) {
				const f = { ...base, kind: 'dead', expected: describe(old), actual: 'nothing changed on the port', behind: 0 };
				findings.push(f);
				deadIds.set(id, f);
			} else {
				if (old.url && !port.url) findings.push({ ...base, kind: 'address', expected: `address becomes ${old.url}`, actual: 'the address stays' });
				const lost = (old.affected ?? []).filter((a) => !(port.affected ?? []).includes(a));
				if (old.affected?.length && lost.length === old.affected.length && !old.popup) findings.push({ ...base, kind: 'region', expected: `changes ${old.affected.join(', ')}`, actual: `changes ${port.affected?.join(', ') || (port.url ? `only the address (${port.url})` : 'only a pop-up')}` });
				if (old.popup) popups.push({ prefix, control, id });
				if (old.popup && port.popup) {
					const o = old.popup, n = port.popup;
					const animOld = o.opacity < 0.95 || transformMoves(o.transform), animNew = n.opacity < 0.95 || transformMoves(n.transform);
					if (animOld !== animNew || Math.abs(o.opacity - n.opacity) > 0.3 || n.firstMs - o.firstMs > 80) findings.push({ ...base, kind: 'popup-first-frame', expected: `first visible ${o.firstMs} ms after the input at opacity ${o.opacity}, ${o.transform}; animations ${o.anims.join(',') || 'none'}`, actual: `first visible ${n.firstMs} ms at opacity ${n.opacity}, ${n.transform}; animations ${n.anims.join(',') || 'none'}` });
					anchorFinding(findings, base, o.anchor, n.anchor, WIDTH);
				}
			}
			const om = old.motion, nm = port.motion;
			if (om && nm) {
				const moving = (m) => m.distinct >= 4 && m.durationMs >= 80;
				// One side moves through frames while the other goes straight to its result.
				const jump = (moving(om) && nm.distinct <= 1) || (moving(nm) && om.distinct <= 1);
				const duration = moving(om) && moving(nm) && Math.abs(om.durationMs - nm.durationMs) > Math.max(150, 0.5 * om.durationMs);
				const cadence = moving(om) && moving(nm) && (nm.distinct < om.distinct * 0.5 || om.distinct < nm.distinct * 0.5 || nm.maxGapMs > Math.max(2 * om.maxGapMs, om.maxGapMs + 100));
				if (jump || duration || cadence) {
					const file = STRIPS ? `${STRIPS}/${route.replace(/[^\w]+/g, '_')}-${tried}.png` : '';
					if (file) strip(file, om.imgs, nm.imgs);
					const line = (m) => `${m.distinct} painted changes over ${m.durationMs} ms (longest gap ${m.maxGapMs} ms, median ${m.medianGapMs ?? 0} ms)`;
					findings.push({ ...base, kind: jump ? 'motion' : duration ? 'motion-duration' : 'motion-cadence', expected: line(om), actual: line(nm), ...(file ? { strip: file } : {}) });
				}
			}
			if (old.hit && port.hit && old.hit !== port.hit && !port.missing) findings.push({ ...base, kind: 'hit-target', expected: `a click at its centre reaches ${old.hit}`, actual: `reaches ${port.hit}` });
			// What the use revealed (a dialog's select, a menu's items, a panel an intro uncovers) is used too, up to two levels down.
			if (prefix.length < 2 && old.opened) {
				const before = new Set(controls.map((c) => c.key));
				const names = new Map();
				let added = 0;
				for (const c of old.opened) {
					if (c.leaves || before.has(c.key) || c.key === control.key) continue;
					const n = (names.get(`${c.role}|${c.name}`) ?? 0) + 1;
					names.set(`${c.role}|${c.name}`, n);
					if (n <= 2 && added++ < 40) queue.push({ prefix: [...prefix, control], control: c });
				}
			}
		}
		// Where each pop-up opens, at the other widths a layout changes at.
		for (const width of ANCHOR_WIDTHS) {
			for (const { prefix, control, id } of popups.slice(0, 20)) {
				const old = await use('old', route, prefix, control, false, width).catch(() => ({}));
				if (!old.popup?.anchor) continue;
				const port = await use('new', route, prefix, control, false, width).catch(() => ({}));
				if (port.popup?.anchor) anchorFinding(findings, { route, control: id }, old.popup.anchor, port.popup.anchor, width);
				else if (port.missing || port.failed || !port.popup) findings.push({ route, control: id, kind: 'popup-missing-at-width', width, expected: `opens a pop-up at ${width} px wide`, actual: port.missing ?? port.failed ?? 'no pop-up on the port' });
			}
		}
	} catch (e) {
		findings.push({ route, kind: 'route-error', control: '', expected: '', actual: e.message.split('\n')[0] });
	}
	appendFileSync(out, JSON.stringify({ route, engine: ENGINE, tried, ms: Date.now() - started, motionMs, findings }) + '\n');
	console.log(`${route}: ${tried} used in ${Math.round((Date.now() - started) / 1000)} s, ${findings.length} findings`);
}
await browser.close();

function anchorFinding(findings, base, a, b, width) {
	if (a && b && (a.side !== b.side || Math.abs(a.dx - b.dx) > 4 || Math.abs(a.dy - b.dy) > 4 || Math.abs(a.w - b.w) > 4)) findings.push({ ...base, kind: 'popup-anchor', width, expected: `${a.side} its trigger, ${a.dx} px across and ${a.dy} px down from its corner, ${a.w}x${a.h} (trigger ${a.tw} wide)`, actual: `${b.side}, ${b.dx} px across, ${b.dy} px down, ${b.w}x${b.h} (trigger ${b.tw} wide)` });
}

function describe(r) {
	return [r.affected?.length ? `changes ${r.affected.join(', ')}` : '', r.url ? `address becomes ${r.url}` : '', r.popup ? 'opens a pop-up' : ''].filter(Boolean).join('; ') || 'moves on screen';
}
