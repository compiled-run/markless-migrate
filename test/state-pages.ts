// Pages built like the original's widgets, each with the owner's bug put back: what the state probe must name.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const STYLE = `.pop { position: absolute; background: white; border: 1px solid #999; padding: 4px; min-width: 160px } [hidden] { display: none !important } [role=menuitem], [role=option] { display: block; padding: 4px 8px }`;
const place = `const place = (pop, trigger, dx = 0, dy = 4, width) => { const r = trigger.getBoundingClientRect(); pop.style.left = r.left + scrollX + dx + 'px'; pop.style.top = r.bottom + scrollY + dy + 'px'; if (width) pop.style.width = width + 'px'; };`;

/** A menu button as Radix's DropdownMenu builds it; `enter`/`exit` are the CSS animations it runs on open and close. */
const dropdown = (label: string, enter: string, exit: string) =>
	`<button id="t" aria-haspopup="menu" aria-expanded="false" aria-controls="m">${label}</button><div class="pop" role="menu" id="m" tabindex="-1" hidden data-state="closed"><div role="menuitem" tabindex="-1">Profile</div><div role="menuitem" tabindex="-1">Billing</div><div role="menuitem" tabindex="-1">Settings</div></div>
<style>${STYLE} @keyframes in { from { opacity: 0; transform: scale(0.95) } } @keyframes out { to { opacity: 0; transform: scale(0.95) } } #m[data-state=open] { animation: ${enter || 'none'} } #m[data-state=closed] { animation: ${exit || 'none'} }</style>
<script>${place} const t = document.getElementById('t'), m = document.getElementById('m');
const show = (open) => { t.setAttribute('aria-expanded', String(open)); if (open) { m.hidden = false; m.dataset.state = 'open'; place(m, t); m.focus(); } else { m.dataset.state = 'closed'; const done = () => { if (m.dataset.state === 'closed') m.hidden = true; }; if (m.getAnimations().length) m.addEventListener('animationend', done, { once: true }); else done(); t.focus(); } };
t.onclick = () => show(m.hidden || m.dataset.state === 'closed');
addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.dataset.state === 'open') show(false); });
document.addEventListener('pointerdown', (e) => { if (m.dataset.state === 'open' && !m.contains(e.target) && !t.contains(e.target)) show(false); });
for (const i of m.children) i.onclick = () => show(false);</script>`;

const ANIMATED_IN = 'in 150ms ease-out';
const ANIMATED_OUT = 'out 150ms ease-in';

/** Recharts tweens a series' path to its new shape when the shown key changes; `jump` sets it at once. One toggle flips Desktop and Mobile. */
const chart = (jump: boolean) =>
	`<button id="mobile" aria-pressed="false">Mobile</button><svg width="600" height="220"><path id="s" fill="none" stroke="#2563eb"/></svg>
<script>const A = [40, 120, 80, 160, 60, 180, 100], B = [150, 50, 170, 70, 140, 30, 120]; const s = document.getElementById('s'), m = document.getElementById('mobile');
const d = (v) => v.map((y, i) => (i ? 'L' : 'M') + (i * 95 + 15) + ' ' + (210 - Math.round(y))).join(' ');
let cur = A.slice(); s.setAttribute('d', d(cur));
const go = (to) => { ${jump ? "cur = to.slice(); s.setAttribute('d', d(cur));" : "const from = cur.slice(), t0 = performance.now(); const f = (now) => { const k = Math.min(1, (now - t0) / 400); cur = from.map((v, i) => v + (to[i] - v) * k); s.setAttribute('d', d(cur)); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);"} };
m.onclick = () => { const on = m.getAttribute('aria-pressed') !== 'true'; m.setAttribute('aria-pressed', String(on)); go(on ? B : A); };</script>`;

/** Base UI's Combobox: its list opens under the chips at their width and fades out on close; the bugs: narrower and moved, or no fade. */
const combobox = (bug: 'narrow' | 'close' | '') =>
	`<div id="chips" style="display: flex; width: 320px; border: 1px solid #999"><input id="cb" role="combobox" aria-expanded="false" aria-controls="l" aria-label="Framework" style="flex: 1; border: 0"></div><div class="pop" role="listbox" id="l" hidden>${['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix'].map((v) => `<div role="option" aria-selected="false">${v}</div>`).join('')}</div>
<style>${STYLE} #l { transition: opacity 150ms } #l[data-state=closed] { opacity: 0 } #l[data-state=open] { opacity: 1 } @starting-style { #l[data-state=open] { opacity: 0 } }</style>
<script>${place} const c = document.getElementById('cb'), l = document.getElementById('l'), chips = document.getElementById('chips');
const show = (open) => { c.setAttribute('aria-expanded', String(open)); if (open) { l.hidden = false; l.dataset.state = 'open'; place(l, chips, ${bug === 'narrow' ? 78 : 0}, 4, ${bug === 'narrow' ? 237 : 320}); } else { l.dataset.state = 'closed'; ${bug === 'close' ? 'l.style.transition = "none"; l.hidden = true;' : "setTimeout(() => { if (l.dataset.state === 'closed') l.hidden = true; }, 150);"} } };
c.addEventListener('click', () => show(true)); c.addEventListener('keydown', (e) => { if (e.key === 'Escape') show(false); if (e.key === 'ArrowDown') { e.preventDefault(); show(true); } });
for (const o of l.children) o.addEventListener('click', () => { o.setAttribute('aria-selected', 'true'); show(false); c.focus(); });
document.addEventListener('pointerdown', (e) => { if (l.dataset.state === 'open' && !l.contains(e.target) && !chips.contains(e.target)) show(false); });</script>`;

/** A tooltip above its trigger; `covers` puts it on top of the trigger, as the port did. */
const tooltip = (covers: boolean) =>
	`<div style="padding: 60px; position: relative"><button id="tip" aria-describedby="tc">Hover</button><div role="tooltip" id="tc" hidden style="position: fixed; padding: 4px 8px; background: #111; color: white">Add to library</div></div>
<script>const t = document.getElementById('tip'), c = document.getElementById('tc');
const show = () => { c.hidden = false; const r = t.getBoundingClientRect(); c.style.left = (${covers ? 'r.left - 8' : 'r.left + r.width / 2 - c.offsetWidth / 2'}) + 'px'; c.style.top = (${covers ? 'r.top' : 'r.top - c.offsetHeight - 6'}) + 'px'; };
t.addEventListener('pointerenter', () => setTimeout(show, 200)); t.addEventListener('pointerleave', () => { c.hidden = true; });
t.addEventListener('focus', show); t.addEventListener('blur', () => { c.hidden = true; });</script>`;

/** The owner's examples: each the original's page and the port's with the bug, and the finding that must name it. */
export const CASES: Record<string, { old: string; bad: string; caught: RegExp }> = {
	avatar: { old: dropdown('shadcn', '', ''), bad: dropdown('shadcn', ANIMATED_IN, ''), caught: /^motion: motion opening menu after click it on button "shadcn" \(state probe: .*\) \| old: no animation \| new: opacity,transform 150 ms/ },
	'three-dots': { old: dropdown('Toggle menu', ANIMATED_IN, ANIMATED_OUT), bad: dropdown('Toggle menu', 'in 300ms ease-out', 'out 150ms linear'), caught: /^motion: motion (opening|closing) menu after .* on button "Toggle menu"/ },
	chart: { old: chart(false), bad: chart(true), caught: /^motion: script motion of path outside the widget \(path\) after .* on button "Mobile".*\| old: moves frame by frame: \d+ frames .*\| new: (jumps|set on)/ },
	'combobox-narrow': { old: combobox(''), bad: combobox('narrow'), caught: /^behaviour: pop-up place of listbox after .* on combobox "Framework" .*\| old: below its trigger, start-aligned.*\(1\.0\d?x the trigger.*\| new: .*\(0\.7\d?x the trigger.*differs in .*width/ },
	'combobox-close': { old: combobox(''), bad: combobox('close'), caught: /^motion: motion closing listbox after .* on combobox "Framework"/ },
	tooltip: { old: tooltip(false), bad: tooltip(true), caught: /^behaviour: pop-up place of tooltip after .* on button "Hover" .*\| old: above its trigger.*\| new: over its trigger.*hiding its trigger/ },
};

export function serve(pages: Record<string, string>): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		const page = pages[new URL(req.url ?? '/', 'http://x').pathname];
		if (page === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="en"><title>State</title><body><main><h1>State</h1>${page}</main></body></html>`);
	});
	return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

