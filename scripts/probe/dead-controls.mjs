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
const BOX_TOLERANCE = Number(process.env.BOX_TOLERANCE ?? 2);
const KEY_MAX = Number(process.env.KEY_MAX ?? 24);
const INPUT_MAX = Number(process.env.INPUT_MAX ?? 24);
const KEYS_PER_CONTROL = Number(process.env.KEYS_PER_CONTROL ?? 4);
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
	const frames = new Map();
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
			// A link to the page itself navigates to it again: what each app re-renders for that is no control's effect.
			try { const u = new URL(href, location.href); leaves = u.origin !== location.origin || u.pathname !== location.pathname || (u.hash !== '' && u.search === location.search) || (u.search === location.search && u.hash === ''); } catch { leaves = true; }
		}
		const frame = el.closest('[data-slot=preview], figure, section, [role=dialog], main') ?? document.body;
		if (!frames.has(frame)) frames.set(frame, frames.size);
		const f = frame.getBoundingClientRect();
		const slot = el.closest('[data-slot]')?.getAttribute('data-slot') ?? '';
		const pr = el.parentElement?.getBoundingClientRect() ?? r;
		const hint = [el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.getAttribute('inputmode'), el.getAttribute('aria-label')].filter(Boolean).join(' ');
		out.push({ popup: el.hasAttribute('aria-haspopup') || el.hasAttribute('aria-expanded'), hint, parent: { w: Math.round(pr.width), h: Math.round(pr.height) }, frameBox: frame.matches('main') || frame === document.body ? undefined : { w: Math.round(f.width), h: Math.round(f.height) }, frameId: frames.get(frame), key: `${role} "${name}"${nth ? ` #${nth + 1}` : ''}`, role, name, nth, layout: Boolean(el.closest(LAYOUT)), leaves, box: { x: Math.round(r.x - f.x), y: Math.round(r.y - f.y), w: Math.round(r.width), h: Math.round(r.height) }, pageY: Math.round(r.y + scrollY), template: `${role}|${slot}`, type: el.type ?? '', options: el.localName === 'select' ? [...el.options].map((o) => o.value) : undefined, inDialog: Boolean(el.closest('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')) });
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
	// The scroll alone can restyle the page (a sticky header): it settles before anything is watched.
	if (control.scrollOnly) return { scrolled: true };
	const r = el.getBoundingClientRect();
	const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
	const reach = (x, y) => {
		const hitEl = document.elementFromPoint(x, y);
		const owner = hitEl?.closest(SEL);
		return !hitEl ? 'nothing' : owner === el || el.contains(hitEl) ? 'itself' : owner ? `${roleOf(owner)} "${nameOf(owner)}"` : `${hitEl.localName} (no control)`;
	};
	const hits = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]].map(([fx, fy]) => reach(r.x + r.width * fx, r.y + r.height * fy));
	const hit = hits[0];
	// Pop-ups already open float over the page; a list laid out in it (a cmdk command list) is the page itself.
	const floating = (p) => { for (let at = p; at && at !== document.body; at = at.parentElement) if (/fixed|absolute/.test(getComputedStyle(at).position) || at.hasAttribute('popover')) return true; return false; };
	const openBefore = new Set([...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=tooltip]')].filter((p) => p.checkVisibility() && floating(p)));
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
		const popup = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')].find((p) => !openBefore.has(p) && p.checkVisibility() && floating(p));
		if (popup && firstInput !== undefined) {
			const cs = getComputedStyle(popup);
			frames.push({ ms: Math.round(now - firstInput), opacity: Number(cs.opacity), transform: cs.transform, anims: popup.getAnimations().map((a) => a.animationName ?? a.transitionProperty ?? 'animation') });
		}
		if (now - t0 < 1500 && frames.length < 30) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const url = location.pathname + location.search;
	globalThis.__dc = { observer, touched, was, frames, url, openBefore, el, floating };
	return { hit, hits, x: cx, y: cy };
}

// In the page: what the use changed outside the control and the pop-ups that were already open.
function read(prefix) {
	const st = globalThis.__dc;
	st.observer.disconnect();
	const CSEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=combobox], [role=slider], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=link], [role=treeitem]';
	const CIMPLICIT = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', summary: 'button' };
	const croleOf = (el) => el.getAttribute('role') ?? (el.localName === 'input' ? ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', search: 'searchbox' }[el.type] ?? 'textbox') : CIMPLICIT[el.localName] ?? el.localName);
	const cnameOf = (el) => {
		const by = el.getAttribute('aria-labelledby');
		const n = el.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '') ?? '';
		return (n || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
	};
	const focusKey = () => {
		const a = document.activeElement;
		if (!a || a === document.body || a === document.documentElement) return 'the page';
		if (!a.matches(CSEL)) return `${a.getAttribute('role') ?? a.localName}${a.getAttribute('aria-label') ? ` "${a.getAttribute('aria-label').slice(0, 40)}"` : ''}`;
		const same = [...document.querySelectorAll(CSEL)].filter((el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && croleOf(el) === croleOf(a) && cnameOf(el) === cnameOf(a));
		const nth = same.indexOf(a);
		return `${croleOf(a)} "${cnameOf(a)}"${nth > 0 ? ` #${nth + 1}` : ''}`;
	};
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
		// What the use hid (items a filter leaves out) changed the page too, even though it is hidden now.
		const hid = attrs.has(el) && [...st.was.get(el).keys()].some((n) => /^(hidden|style|class|aria-hidden|data-state|data-hidden)$/.test(n));
		if (!el.checkVisibility() && !el.parentElement?.checkVisibility() && !hid) continue;
		affected.add(regionOf(el));
	}
	const vis = st.frames;
	const first = vis[0];
	const shownPopup = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')].find((p) => !st.openBefore.has(p) && p.checkVisibility() && (st.floating?.(p) ?? true));
	let anchor;
	if (shownPopup && st.el.isConnected) {
		const t = st.el.getBoundingClientRect(), p = shownPopup.getBoundingClientRect();
		anchor = { side: p.top >= t.bottom - 2 ? 'below' : p.bottom <= t.top + 2 ? 'above' : p.left >= t.right - 2 ? 'right' : p.right <= t.left + 2 ? 'left' : 'over', dx: Math.round(p.left - t.left), dy: Math.round(p.top - t.bottom), w: Math.round(p.width), h: Math.round(p.height), tw: Math.round(t.width) };
	}
	return { focus: focusKey(), popupRole: shownPopup ? shownPopup.getAttribute('role') : '', affected: [...affected].sort().slice(0, 6), url: location.pathname + location.search !== st.url ? location.pathname + location.search : '', popup: first ? { firstMs: first.ms, opacity: Math.round(first.opacity * 100) / 100, transform: first.transform, anims: [...new Set(vis.flatMap((f) => f.anims))].sort(), ...(anchor ? { anchor } : {}) } : undefined };
}

// In the page: the control a click reaches at points spread over each landmark region in view, by fraction of the region.
function regionGrid(points) {
	const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=combobox], [role=slider], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=link], [role=treeitem]';
	const IMPLICIT = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', summary: 'button' };
	const roleOf = (el) => el.getAttribute('role') ?? (el.localName === 'input' ? ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', search: 'searchbox' }[el.type] ?? 'textbox') : IMPLICIT[el.localName] ?? el.localName);
	const nameOf = (el) => {
		const by = el.getAttribute('aria-labelledby');
		const n = el.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '') ?? '';
		return (n || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
	};
	const keyOf = (x, y) => {
		const e = document.elementFromPoint(x, y);
		if (!e) return 'nothing';
		const c = e.closest(SEL);
		return c ? `${roleOf(c)} "${nameOf(c)}"` : 'no control';
	};
	const LAND = 'header, nav, main, aside, footer, [role=banner], [role=navigation], [role=main], [role=complementary], [role=contentinfo]';
	const seen = new Map();
	const regions = [];
	for (const el of document.querySelectorAll(LAND)) {
		if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || el.closest('[hidden], [inert]')) continue;
		const r = el.getBoundingClientRect();
		const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
		if (bottom - top < 20 || right - left < 20) continue;
		const name = `${el.getAttribute('role') ?? el.localName}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}`;
		const nth = seen.get(name) ?? 0;
		seen.set(name, nth + 1);
		const id = `${name}${nth ? ` #${nth + 1}` : ''}`;
		const box = { left, top, w: right - left, h: bottom - top };
		if (points) {
			const mine = points.filter((p) => p.region === id);
			// A point counts as reaching the same control when it does within 4 px, so a layout a pixel off is no difference.
			regions.push(...mine.map((p) => { const x = box.left + p.fx * box.w, y = box.top + p.fy * box.h; return { ...p, near: [...new Set([[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].map(([dx, dy]) => keyOf(x + dx, y + dy)))] }; }));
			continue;
		}
		const spots = [0.1, 0.3, 0.5, 0.7, 0.9].flatMap((fy) => [0.1, 0.3, 0.5, 0.7, 0.9].map((fx) => [fx, fy]));
		for (const c of [...el.querySelectorAll(SEL)].filter((c) => c.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !c.closest('[hidden], [inert], [aria-hidden=true]')).slice(0, 20)) {
			const b = c.getBoundingClientRect();
			const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
			if (b.width >= 2 && cx > box.left && cx < box.left + box.w && cy > box.top && cy < box.top + box.h) spots.push([(cx - box.left) / box.w, (cy - box.top) / box.h]);
		}
		for (const [fx, fy] of spots) regions.push({ region: id, fx, fy, key: keyOf(box.left + fx * box.w, box.top + fy * box.h) });
	}
	return regions;
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
const errors = { old: [], new: [] };
let context;
async function fresh(width = WIDTH) {
	await context?.close().catch(() => {});
	context = await browser.newContext({ viewport: { width, height: 900 } });
	if (BYPASS) await context.route(`${NEW}/**`, (r) => r.continue({ headers: { ...r.request().headers(), 'x-vercel-protection-bypass': BYPASS } }));
	for (const side of ['old', 'new']) {
		pages[side] = await context.newPage();
		pages[side].on('dialog', (d) => d.dismiss().catch(() => {}));
		pages[side].on('pageerror', (e) => errors[side].push(String(e.message ?? e).split('\n')[0].slice(0, 160)));
		if (ENGINE === 'chromium') cdp[side] = await context.newCDPSession(pages[side]);
	}
}
const layoutDone = new Set();
const keyDone = new Set();
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
	await settleScroll(p);
}

// A page scrolls some of its parts after load (a sidebar to its active link): boxes are read once every scroll position holds.
async function settleScroll(p) {
	const read = () => p.evaluate(() => [scrollY, ...[...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map((e) => e.scrollTop)].join(',')).catch(() => '');
	let last = await read();
	for (let waited = 0; waited < 3000; waited += 250) {
		await p.waitForTimeout(250);
		const now = await read();
		if (now === last) return;
		last = now;
	}
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
	// A fade steps through small colour changes: a low colour threshold counts each step.
	const differs = (a, b) => a.width === b.width && a.height === b.height ? pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.02 }) > Math.max(8, a.width * a.height * 0.0001) : true;
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

async function replay(side, route, prefix) {
	const p = pages[side];
	await load(side, route);
	for (const step of prefix) {
		const armed = await armAt(p, step).catch(() => null);
		// A step the page remembers having taken (an intro dismissed for good) is not offered again.
		if (!armed) continue;
		await act(p, step).catch(() => {});
		await p.waitForTimeout(SETTLE);
		await p.evaluate(read, []).catch(() => null);
		await p.evaluate(() => { const el = document.querySelector('[data-dc-used]'); el?.setAttribute('data-dc-prefix', ''); el?.removeAttribute('data-dc-used'); });
	}
}

async function use(side, route, prefix, control, film, width = WIDTH) {
	if (side === 'old') await fresh(width);
	const p = pages[side];
	await replay(side, route, prefix);
	const armed = await armAt(p, control).catch((e) => ({ error: e.message }));
	if (!armed) return { missing: 'not on the page' };
	if (armed.error) return { missing: armed.error.split('\n')[0] };
	let film_;
	const errorsBefore = errors[side].length;
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
	// What changes on its own (an animated preview, a ticking demo) is no answer of the control's.
	if (r.affected && ambient[side]) r.affected = r.affected.filter((a) => !ambient[side].has(a));
	const opened = await p.evaluate(listControls).catch(() => []);
	// The close of the pop-up the use opened, filmed too: Escape, then whether it is gone.
	let close;
	if (film && r.popup) {
		const shot = await filmed(side, () => p.keyboard.press('Escape'));
		await p.waitForTimeout(SETTLE);
		const still = await p.evaluate(() => [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [role=listbox]')].some((x) => !globalThis.__dc.openBefore.has(x) && x.checkVisibility())).catch(() => false);
		close = { motion: motionOf(shot.frames), still };
	}
	return { hit: armed.hit, hits: armed.hits, ...r, opened, errors: errors[side].slice(errorsBefore), ...(film_ ? { motion: motionOf(film_.frames) } : {}), ...(close ? { close } : {}) };
}

async function act(p, c) {
	const loc = p.locator('[data-dc-used]').first();
	if (c.role === 'textbox' || c.role === 'searchbox') return loc.fill('zq', { timeout: 3000 });
	if (c.options) return loc.selectOption(c.options[1] ?? c.options[0], { timeout: 3000 });
	if (c.role === 'slider') { await loc.focus({ timeout: 3000 }); return p.keyboard.press('ArrowRight'); }
	return loc.click({ timeout: 3000 });
}

const INPUT_VALUES = {
	date: ['May 28, 2025', '2025-05-28', '05/28/2025', '28/05/2025', '28.05.2025', '5/28/25', '2025-02-30', 'tomorrow', 'abc'],
	nativeDate: ['2025-05-28', '05282025', '2025-02-28'],
	number: ['42', '0', '-1', '3.14', '1e3', '99999999', 'abc', ''],
	text: ['May 28, 2025', '42', 'abc', 'zq zq', ''],
};
const isInput = (c) => /^(textbox|searchbox|spinbutton|combobox)$/.test(c.role) && !c.options && /^(text|search|date|number|email|tel|url|textarea|)$/.test(c.type ?? '');
function inputKind(c) {
	if (c.type === 'date') return 'nativeDate';
	if (/date|day|month|year|birth|calendar|dd|mm\/|yyyy|\d{1,2}\/\d{1,2}/i.test(`${c.hint} ${c.name}`)) return 'date';
	if (c.type === 'number' || /numeric|decimal|amount|price|quantity|count|age/i.test(c.hint ?? '') || c.role === 'spinbutton') return 'number';
	return 'text';
}

async function typeInto(side, route, prefix, control, value) {
	if (side === 'old') await fresh();
	const p = pages[side];
	await replay(side, route, prefix);
	const armed = await armAt(p, control).catch((e) => ({ error: e.message }));
	if (!armed) return { missing: 'not on the page' };
	if (armed.error) return { missing: armed.error.split('\n')[0] };
	const before = errors[side].length;
	const loc = p.locator('[data-dc-used]').first();
	await loc.click({ timeout: 3000 });
	if (control.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) await loc.fill(value, { timeout: 3000 });
	else {
		await p.keyboard.press('ControlOrMeta+A');
		await p.keyboard.press('Backspace');
		await p.keyboard.type(value, { delay: 15 });
	}
	await p.keyboard.press('Enter');
	await p.waitForTimeout(200);
	await p.evaluate(() => (document.querySelector('[data-dc-used]') ?? globalThis.__dc?.el)?.blur?.()).catch(() => {});
	await p.waitForTimeout(SETTLE);
	const field = await p.evaluate(() => {
		const el = document.querySelector('[data-dc-used]') ?? globalThis.__dc?.el;
		return el ? { value: String(el.value ?? el.textContent ?? '').trim().slice(0, 80), invalid: el.getAttribute('aria-invalid') ?? '', badInput: el.validity ? !el.validity.valid : false, connected: el.isConnected } : { value: '', invalid: '', badInput: false, connected: false };
	}).catch(() => ({ value: '', invalid: '', badInput: false, connected: false }));
	let r = await p.evaluate(read, ['[data-dc-prefix]']).catch(() => undefined);
	if (!r) { const u = new URL(p.url()); return { affected: [], url: u.pathname + u.search, field, errors: errors[side].slice(before) }; }
	if (r.affected && ambient[side]) r.affected = r.affected.filter((a) => !ambient[side].has(a));
	// What a pop-up the field drives shows for the value (a date picker's chosen day): ArrowDown in the field, else the button beside it.
	await loc.focus({ timeout: 2000 }).catch(() => {});
	await p.keyboard.press('ArrowDown').catch(() => {});
	await p.waitForTimeout(500);
	let shown = await p.evaluate(popupSummary).catch(() => '');
	if (!shown && (await p.evaluate(markBeside).catch(() => false))) {
		await p.locator('[data-dc-beside]').first().click({ timeout: 2000 }).catch(() => {});
		await p.waitForTimeout(600);
		shown = await p.evaluate(popupSummary).catch(() => '');
	}
	return { ...r, field, shown, errors: errors[side].slice(before) };
}

// In the page: what a pop-up opened over the page marks as chosen, and its caption.
function popupSummary() {
	const before = globalThis.__dc?.openBefore ?? new Set();
	const pop = [...document.querySelectorAll('[role=dialog], [role=listbox], [role=menu], [role=grid], [data-slot=popover-content]')].find((x) => !before.has(x) && x.checkVisibility() && !x.closest('main [data-dc-used]'));
	if (!pop) return '';
	const picked = [...pop.querySelectorAll('[aria-selected=true], [data-selected=true], [data-selected-single=true], [aria-checked=true], [aria-current=date]')].filter((x) => x.checkVisibility()).map((x) => `${x.textContent.trim().slice(0, 30)}${x.getAttribute('data-day') ? ` (${x.getAttribute('data-day')})` : ''}`);
	const caption = [...pop.querySelectorAll('[role=status], [aria-live], [class*=caption]')].filter((x) => x.checkVisibility()).map((x) => x.textContent.trim().slice(0, 40));
	return [...new Set([...caption, ...picked])].join('; ').slice(0, 200) || `${pop.getAttribute('role') ?? 'pop-up'} open`;
}

// In the page: the button beside the used field (in its group), marked.
function markBeside() {
	const el = document.querySelector('[data-dc-used]');
	for (let at = el?.parentElement, up = 0; at && up < 2; at = at.parentElement, up++) {
		const b = [...at.querySelectorAll('button, [role=button]')].find((x) => x !== el && x.checkVisibility());
		if (b) { b.setAttribute('data-dc-beside', ''); return true; }
	}
	return false;
}

function inputFindings(findings, base, old, port) {
	if (port.missing || port.failed) return void findings.push({ ...base, kind: 'input-unusable', expected: `takes the value (ends as "${old.field.value}")`, actual: port.missing ?? port.failed });
	const o = old.field, n = port.field;
	if (o.value !== n.value) findings.push({ ...base, kind: 'input-value', expected: `the field ends as "${o.value}"`, actual: `"${n.value}"` });
	const asSet = (t) => (t ?? '').split('; ').sort().join('; ');
	if (old.shown && asSet(old.shown) !== asSet(port.shown)) findings.push({ ...base, kind: 'input-popup', expected: `its pop-up then shows ${old.shown}`, actual: port.shown ? `shows ${port.shown}` : 'no pop-up opens' });
	if (o.invalid !== n.invalid || o.badInput !== n.badInput) findings.push({ ...base, kind: 'input-invalid', expected: `aria-invalid ${o.invalid || 'unset'}, ${o.badInput ? 'invalid' : 'valid'} to the browser`, actual: `aria-invalid ${n.invalid || 'unset'}, ${n.badInput ? 'invalid' : 'valid'}` });
	if ((old.url ?? '') !== (port.url ?? '')) findings.push({ ...base, kind: 'input-address', expected: old.url ? `address becomes ${old.url}` : 'the address stays', actual: port.url ? `becomes ${port.url}` : 'the address stays' });
	const lost = (old.affected ?? []).filter((a) => !(port.affected ?? []).includes(a));
	if (old.affected?.length && lost.length === old.affected.length) findings.push({ ...base, kind: port.affected?.length ? 'input-region' : 'input-dead', expected: `changes ${old.affected.join(', ')}`, actual: port.affected?.length ? `changes ${port.affected.join(', ')}` : 'nothing changed on the port' });
	const thrown = (port.errors ?? []).filter((e) => !(old.errors ?? []).includes(e));
	if (thrown.length) findings.push({ ...base, kind: 'input-error', expected: old.errors?.length ? `throws ${old.errors.join('; ')}` : 'throws nothing', actual: `throws ${thrown.slice(0, 3).join('; ')}` });
}

function keySet(c) {
	if (c.popup && c.role === 'button') return [['ArrowDown'], ['Enter'], ['Enter', 'Escape'], ['Space'], ['ArrowUp'], ['Enter', 'ArrowDown', 'ArrowDown', 'Enter']];
	if (/^(tab|radio|menuitemradio|treeitem|option)$/.test(c.role)) return [['ArrowRight'], ['End'], ['ArrowRight', 'Enter'], ['Tab'], ['ArrowLeft'], ['ArrowDown'], ['Home']];
	if (/^(textbox|searchbox)$/.test(c.role)) return [['ArrowDown', 'Enter'], ['Escape'], ['Tab'], ['ArrowDown'], ['Enter']];
	if (c.role === 'combobox') return [['Enter'], ['ArrowDown', 'ArrowDown', 'Enter'], ['Enter', 'Escape'], ['Tab'], ['Space'], ['ArrowDown'], ['ArrowUp'], ['Escape']];
	if (c.role === 'slider') return [['ArrowRight'], ['End'], ['ArrowLeft'], ['Home'], ['PageUp']];
	if (/^(checkbox|switch|menuitemcheckbox)$/.test(c.role)) return [['Space'], ['Enter'], ['Tab']];
	if (c.role === 'link') return [['Tab'], ['Shift+Tab']];
	return [['Enter'], ['Space'], ['Enter', 'ArrowDown', 'ArrowDown', 'Enter'], ['Enter', 'Escape'], ['Tab'], ['Shift+Tab'], ['ArrowDown'], ['Escape']];
}

async function press(side, route, control, keys) {
	if (side === 'old') await fresh();
	const p = pages[side];
	await load(side, route);
	const armed = await armAt(p, control).catch((e) => ({ error: e.message }));
	if (!armed) return { missing: 'not on the page' };
	if (armed.error) return { missing: armed.error.split('\n')[0] };
	const before = errors[side].length;
	await p.locator('[data-dc-used]').first().focus({ timeout: 3000 });
	for (const k of keys) {
		await p.keyboard.press(k);
		await p.waitForTimeout(150);
	}
	await p.waitForTimeout(SETTLE);
	const r = await p.evaluate(read, []).catch((e) => ({ error: e.message }));
	if (r.affected && ambient[side]) r.affected = r.affected.filter((a) => !ambient[side].has(a));
	return { ...r, errors: errors[side].slice(before) };
}

function keyFindings(findings, base, old, port) {
	if (port.missing || port.failed || port.error) return void findings.push({ ...base, kind: 'key-unusable', expected: `focusable and answers: ${describe(old)}`, actual: port.missing ?? port.failed ?? port.error });
	const did = (r) => Boolean(r.affected?.length || r.url || r.popupRole);
	if (did(old) && !did(port) && old.focus !== 'the page' && port.focus === old.focus) findings.push({ ...base, kind: 'key-dead', expected: describe(old), actual: 'nothing changed on the port' });
	if (old.focus !== port.focus) findings.push({ ...base, kind: 'key-focus', expected: `focus ends on ${old.focus}`, actual: `on ${port.focus}` });
	if ((old.url ?? '') !== (port.url ?? '')) findings.push({ ...base, kind: 'key-address', expected: old.url ? `address becomes ${old.url}` : 'the address stays', actual: port.url ? `becomes ${port.url}` : 'the address stays' });
	if ((old.popupRole ?? '') !== (port.popupRole ?? '')) findings.push({ ...base, kind: 'key-popup', expected: old.popupRole ? `a ${old.popupRole} is open` : 'no pop-up open', actual: port.popupRole ? `a ${port.popupRole} is open` : 'no pop-up open' });
	const lost = (old.affected ?? []).filter((a) => !(port.affected ?? []).includes(a));
	if (did(port) && old.affected?.length && lost.length === old.affected.length) findings.push({ ...base, kind: 'key-region', expected: `changes ${old.affected.join(', ')}`, actual: `changes ${port.affected?.join(', ') || 'no region'}` });
	const thrown = (port.errors ?? []).filter((e) => !(old.errors ?? []).includes(e));
	if (thrown.length) findings.push({ ...base, kind: 'key-error', expected: old.errors?.length ? `throws ${old.errors.join('; ')}` : 'throws nothing', actual: `throws ${thrown.slice(0, 3).join('; ')}` });
}

const SCROLL_SETTLE = Number(process.env.SCROLL_SETTLE ?? 500);
async function armAt(p, control) {
	const at = await p.evaluate(arm, { ...control, scrollOnly: true });
	if (!at) return at;
	await p.waitForTimeout(SCROLL_SETTLE);
	return p.evaluate(arm, control);
}

const ambient = { old: undefined, new: undefined };
async function measureAmbient(side, route) {
	await load(side, route);
	const p = pages[side];
	await p.evaluate(arm, { role: '__none__', name: '', nth: 0 }).catch(() => null);
	await p.evaluate(() => {
		const o = new MutationObserver(() => {});
		globalThis.__dc = { observer: o, touched: new Set(), was: new Map(), frames: [], url: location.pathname + location.search, openBefore: new Set(), el: document.body };
	});
	await p.evaluate(armQuiet);
	await p.waitForTimeout(1500);
	const r = await p.evaluate(read, []).catch(() => ({ affected: [] }));
	return new Set(r.affected ?? []);
}

// In the page: the observers of arm() with nothing used, to learn what changes on its own.
function armQuiet() {
	const st = globalThis.__dc;
	const observe = (doc) => st.observer.observe(doc, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
	st.observer = new MutationObserver((records) => {
		for (const rec of records) {
			if (rec.type === 'attributes') {
				const m = st.was.get(rec.target) ?? st.was.set(rec.target, new Map()).get(rec.target);
				if (!m.has(rec.attributeName)) m.set(rec.attributeName, rec.oldValue);
				continue;
			}
			st.touched.add(rec.target);
			if (rec.type === 'childList') for (const n of rec.addedNodes) st.touched.add(n);
		}
	});
	observe(document);
	for (const f of document.querySelectorAll('iframe')) { try { if (f.contentDocument) observe(f.contentDocument); } catch {} }
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
			const grid = await pages.old.evaluate(regionGrid, null).catch(() => []);
			await load('new', route);
			const news = await pages.new.evaluate(listControls).catch(() => []);
			const portGrid = await pages.new.evaluate(regionGrid, grid.filter((g) => g.key !== 'no control')).catch(() => []);
			let gridMisses = 0;
			const portRegions = new Set(portGrid.map((g) => g.region));
			for (const g of portGrid) {
				const countless = (k) => k.replace(/\d[\d.,]*[kKmM]?/g, '#');
				if (g.near.some((k) => countless(k) === countless(g.key)) || gridMisses++ >= 10) continue;
				findings.push({ route, control: g.region, kind: 'hit-region', width, expected: `a click ${Math.round(g.fx * 100)}% across and ${Math.round(g.fy * 100)}% down the region in view reaches ${g.key}`, actual: `reaches ${g.near.join(' / ')}` });
			}
			for (const r of new Set(grid.map((g) => g.region))) if (!portRegions.has(r) && grid.some((g) => g.region === r && g.key !== 'no control')) findings.push({ route, control: r, kind: 'hit-region', width, expected: `${r} in view with controls`, actual: 'no such region in view on the port' });
			if (width === WIDTH) controls = olds.filter((c) => !c.leaves);
			// Namesakes (the page's many Copy buttons) pair by place, not by count: one missing does not shift every later pair.
			const portByKey = new Map();
			const pool = new Map();
			for (const n of news) (pool.get(`${n.role}|${n.name}`) ?? pool.set(`${n.role}|${n.name}`, []).get(`${n.role}|${n.name}`)).push(n);
			let drift = 0;
			for (const c of [...olds].sort((a, b) => a.pageY - b.pageY)) {
				const left = pool.get(`${c.role}|${c.name}`) ?? [];
				if (!left.length) continue;
				const best = left.reduce((a, b) => (Math.abs(b.pageY - c.pageY - drift) < Math.abs(a.pageY - c.pageY - drift) ? b : a));
				if (left.length > 1 && Math.abs(best.pageY - c.pageY - drift) > 400) continue;
				left.splice(left.indexOf(best), 1);
				drift = best.pageY - c.pageY;
				portByKey.set(c.key, best);
			}
			let boxes = 0, missing = 0;
			const containers = new Set();
			// A control moved only by what moved above it in its frame is no finding of its own: only where the shift changes.
			const shiftIn = new Map();
			for (const c of [...olds].sort((a, b) => a.frameId - b.frameId || a.box.y - b.box.y)) {
				if (c.layout) continue;
				const n = portByKey.get(c.key);
				if (!n) {
					if (missing++ < 10) findings.push({ route, control: c.key, kind: 'missing-at-width', width, expected: `shown at ${width} px wide`, actual: 'not on the port at this width' });
					continue;
				}
				const dy = n.box.y - c.box.y;
				const before = shiftIn.get(c.frameId) ?? 0;
				shiftIn.set(c.frameId, dy);
				const d = { w: n.box.w - c.box.w, h: n.box.h - c.box.h, x: n.box.x - c.box.x, y: dy - before };
				if (Math.max(...Object.values(d).map(Math.abs)) > BOX_TOLERANCE && boxes++ < 20) findings.push({ route, control: c.key, kind: 'box', width, expected: `${c.box.w}x${c.box.h} at (${c.box.x}, ${c.box.y}) in its frame`, actual: `${n.box.w}x${n.box.h} at (${n.box.x}, ${n.box.y})` });
				for (const [what, a, b] of [['its parent', c.parent, n.parent], ['its example frame', c.frameBox, n.frameBox]]) {
					if (!a || !b) continue;
					const k = `${what}|${a.w}x${a.h}|${b.w}x${b.h}`;
					if (containers.has(k) || (Math.abs(a.w - b.w) <= BOX_TOLERANCE && Math.abs(a.h - b.h) <= BOX_TOLERANCE)) continue;
					containers.add(k);
					if (boxes++ < 20) findings.push({ route, control: c.key, kind: 'box-container', width, expected: `${what} ${a.w}x${a.h}`, actual: `${b.w}x${b.h}` });
				}
			}
		}
		const popups = [];
		await fresh();
		ambient.old = await measureAmbient('old', route);
		ambient.new = await measureAmbient('new', route);
		if (process.env.DEBUG) console.log('ambient', [...ambient.old], [...ambient.new]);
		const perName = new Map();
		const queue = controls
			.filter((c) => !(c.layout && layoutDone.has(c.key)))
			.filter((c) => { const n = (perName.get(`${c.role}|${c.name}`) ?? 0) + 1; perName.set(`${c.role}|${c.name}`, n); return n <= 2; })
			.map((c) => ({ prefix: [], control: c }));
		for (const c of controls) if (c.layout) layoutDone.add(c.key);
		const done = new Set();
		const deadIds = new Map();
		const nestedInputs = [];
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
			motionFinding(findings, base, old.motion, port.motion, '', `${tried}`);
			if (old.close && port.close) {
				motionFinding(findings, base, old.close.motion, port.close.motion, 'close-', `${tried}-close`);
				if (!old.close.still && port.close.still) findings.push({ ...base, kind: 'close', expected: 'Escape closes the pop-up it opened', actual: 'the pop-up stays open on the port' });
			}
			const POINTS = ['centre', 'left quarter', 'right quarter', 'top quarter', 'bottom quarter'];
			if (old.hits && port.hits && !port.missing) {
				const off = old.hits.map((h, i) => (h !== port.hits[i] ? `${POINTS[i]}: ${h} -> ${port.hits[i]}` : '')).filter(Boolean);
				if (off.length) findings.push({ ...base, kind: 'hit-target', expected: `a click reaches ${[...new Set(old.hits)].join(' / ')}`, actual: off.join('; ') });
			}
			const newErrors = (port.errors ?? []).filter((e) => !(old.errors ?? []).includes(e));
			if (newErrors.length) findings.push({ ...base, kind: 'error', expected: old.errors?.length ? `throws ${old.errors.join('; ')}` : 'throws nothing', actual: `throws ${newErrors.slice(0, 3).join('; ')}` });
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
					if (n <= 2 && isInput(c)) nestedInputs.push({ prefix: [...prefix, control], control: c });
				}
			}
		}
		// Inputs: realistic values typed into each text, date, number or search field (and those a use revealed), then Enter and a blur.
		let inputTrials = 0;
		const inputTemplates = new Map();
		for (const { prefix, control } of [...controls.filter((c) => !c.layout && isInput(c)).map((c) => ({ prefix: [], control: c })), ...nestedInputs]) {
			const kind = inputKind(control);
			const seenKind = `${control.template}|${kind}`;
			const n = (inputTemplates.get(seenKind) ?? 0) + 1;
			inputTemplates.set(seenKind, n);
			if (n > (kind === 'date' ? 3 : 1)) continue;
			for (const value of INPUT_VALUES[kind]) {
				if (inputTrials >= INPUT_MAX) break;
				const id = `${[...prefix.map((s) => s.key), control.key].join(' > ')} <- "${value}"`;
				if (process.env.ONLY && !new RegExp(process.env.ONLY).test(id)) continue;
				inputTrials++;
				const old = await typeInto('old', route, prefix, control, value).catch((e) => ({ failed: e.message.split('\n')[0] }));
				if (old.failed || old.missing) continue;
				const port = await typeInto('new', route, prefix, control, value).catch((e) => ({ failed: e.message.split('\n')[0] }));
				if (process.env.DEBUG) console.log('  ', id, '\n     old', JSON.stringify(old), '\n     new', JSON.stringify(port));
				inputFindings(findings, { route, control: id }, old, port);
			}
		}
		// Keyboard: a standard key set, one key and short sequences, from one control of each kind focused on a fresh load.
		const keyTemplates = new Set();
		let keyTrials = 0;
		const rank = (c) => (c.layout ? 2 : c.role === 'link' ? 1 : 0);
		for (const control of [...controls].sort((a, b) => rank(a) - rank(b))) {
			if (keyTrials >= KEY_MAX) break;
			if ((control.layout && keyDone.has(control.key)) || keyTemplates.has(control.template)) continue;
			keyTemplates.add(control.template);
			if (control.layout) keyDone.add(control.key);
			for (const keys of keySet(control).slice(0, KEYS_PER_CONTROL)) {
				if (keyTrials >= KEY_MAX) break;
				const id = `${control.key} + ${keys.join(' ')}`;
				if (process.env.ONLY && !new RegExp(process.env.ONLY).test(id)) continue;
				keyTrials++;
				const old = await press('old', route, control, keys).catch((e) => ({ failed: e.message.split('\n')[0] }));
				if (old.failed || old.missing || leftPage(old, route)) continue;
				const port = await press('new', route, control, keys).catch((e) => ({ failed: e.message.split('\n')[0] }));
				if (process.env.DEBUG) console.log('  ', id, '\n     old', JSON.stringify(old), '\n     new', JSON.stringify(port));
				keyFindings(findings, { route, control: id }, old, port);
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

function motionFinding(findings, base, om, nm, prefix, tag) {
	if (!om || !nm) return;
	const moving = (m) => m.distinct >= 4 && m.durationMs >= 80;
	// One side moves through frames while the other goes straight to its result.
	const jump = (moving(om) && nm.distinct <= 1) || (moving(nm) && om.distinct <= 1);
	const duration = moving(om) && moving(nm) && Math.abs(om.durationMs - nm.durationMs) > Math.max(150, 0.5 * om.durationMs);
	const cadence = moving(om) && moving(nm) && (nm.distinct < om.distinct * 0.5 || om.distinct < nm.distinct * 0.5 || nm.maxGapMs > Math.max(2 * om.maxGapMs, om.maxGapMs + 100));
	if (!(jump || duration || cadence)) return;
	const file = STRIPS ? `${STRIPS}/${base.route.replace(/[^\w]+/g, '_')}-${tag}.png` : '';
	if (file) strip(file, om.imgs, nm.imgs);
	const line = (m) => `${m.distinct} painted changes over ${m.durationMs} ms (longest gap ${m.maxGapMs} ms, median ${m.medianGapMs ?? 0} ms)`;
	findings.push({ ...base, kind: `${prefix}${jump ? 'motion' : duration ? 'motion-duration' : 'motion-cadence'}`, expected: line(om), actual: line(nm), ...(file ? { strip: file } : {}) });
}

function anchorFinding(findings, base, a, b, width) {
	if (a && b && (a.side !== b.side || Math.abs(a.dx - b.dx) > 4 || Math.abs(a.dy - b.dy) > 4 || Math.abs(a.w - b.w) > 4)) findings.push({ ...base, kind: 'popup-anchor', width, expected: `${a.side} its trigger, ${a.dx} px across and ${a.dy} px down from its corner, ${a.w}x${a.h} (trigger ${a.tw} wide)`, actual: `${b.side}, ${b.dx} px across, ${b.dy} px down, ${b.w}x${b.h} (trigger ${b.tw} wide)` });
}

function describe(r) {
	return [r.affected?.length ? `changes ${r.affected.join(', ')}` : '', r.url ? `address becomes ${r.url}` : '', r.popup ? 'opens a pop-up' : ''].filter(Boolean).join('; ') || 'moves on screen';
}
