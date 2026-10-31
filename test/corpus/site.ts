// A micro-site with one page per bug the owner found by hand in the ui.shadcn.com port, each widget built the way the
// original's library builds it (roles, states, timing). A case's mutant is that page with the bug put back.

export const page = (title: string, body: string, script = '', style = '') =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>
body { margin: 0; font: 16px/1.5 sans-serif } header { height: 56px; display: flex; gap: 12px; align-items: center; padding: 0 16px; border-bottom: 1px solid #ddd }
main { padding: 24px; max-width: 900px } button { font: inherit; padding: 4px 10px } [hidden] { display: none !important }
.pop { position: absolute; z-index: 10; background: white; border: 1px solid #999; border-radius: 6px; padding: 4px; min-width: 160px; box-shadow: 0 4px 12px rgba(0,0,0,.15) }
[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option] { display: flex; gap: 6px; padding: 4px 8px; cursor: default; outline: none }
[role=menuitem]:focus, [role=menuitemradio]:focus, [role=menuitemcheckbox]:focus, [role=option][data-highlighted] { background: #eef }
${style}</style></head><body><header><a href="/">Home</a><a href="/docs">Docs</a></header><main><h1>${title}</h1>${body}</main><script>
const $ = (id) => document.getElementById(id);
const place = (pop, trigger, dx = 0, dy = 4, width) => { const r = trigger.getBoundingClientRect(); pop.style.left = r.left + scrollX + dx + 'px'; pop.style.top = r.bottom + scrollY + dy + 'px'; if (width) pop.style.width = width + 'px'; };
${script}</script></body></html>`;

/** A menu button and its menu, as Radix's DropdownMenu builds it: arrows move, Escape and a click outside close it. */
export const menuScript = (trigger: string, menu: string, onPick = '') => `
(() => { const t = $('${trigger}'), m = $('${menu}');
const items = () => [...m.querySelectorAll('[role^=menuitem]')];
const show = (open, focusFirst = true) => { m.hidden = !open; t.setAttribute('aria-expanded', String(open)); m.dataset.state = open ? 'open' : 'closed'; if (open) { place(m, t); if (focusFirst) items()[0].focus(); else m.focus(); } else t.focus(); };
t.addEventListener('click', () => show(m.hidden, false));
t.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(true); } });
m.addEventListener('keydown', (e) => { const i = items(), k = i.indexOf(document.activeElement);
	if (e.key === 'ArrowDown') { e.preventDefault(); i[(k + 1) % i.length].focus(); }
	if (e.key === 'ArrowUp') { e.preventDefault(); i[(k - 1 + i.length) % i.length].focus(); }
	if (e.key === 'Escape') show(false);
	if ((e.key === 'Enter' || e.key === ' ') && k >= 0) { e.preventDefault(); i[k].click(); } });
for (const item of items()) { item.tabIndex = -1; item.addEventListener('pointermove', () => item.focus()); item.addEventListener('click', () => { const keep = (${onPick || '() => false'})(item); if (!keep) show(false); }); }
document.addEventListener('pointerdown', (e) => { if (!m.hidden && !m.contains(e.target) && !t.contains(e.target)) show(false); });
})();`;

const menu = (id: string, items: string) => `<div class="pop" role="menu" id="${id}" tabindex="-1" hidden>${items}</div>`;

/** A select whose listbox opens under its trigger, as Radix's Select does in popper mode. */
export const selectScript = (trigger: string, list: string, onChoose = '', dx = 0) => `
(() => { const t = $('${trigger}'), l = $('${list}');
const opts = () => [...l.querySelectorAll('[role=option]')];
const hi = (o) => { for (const x of opts()) delete x.dataset.highlighted; if (o) { o.dataset.highlighted = ''; t.setAttribute('aria-activedescendant', o.id); } };
const show = (open) => { l.hidden = !open; t.setAttribute('aria-expanded', String(open)); if (open) { place(l, t, ${dx}, 4); hi(opts().find((o) => o.getAttribute('aria-selected') === 'true') ?? opts()[0]); } else t.removeAttribute('aria-activedescendant'); };
const choose = (o) => { for (const x of opts()) x.setAttribute('aria-selected', String(x === o)); (${onChoose || '() => {}'})(o); show(false); t.focus(); };
t.addEventListener('click', () => show(l.hidden));
t.addEventListener('keydown', (e) => { const i = opts(), k = i.findIndex((o) => 'highlighted' in o.dataset);
	if (l.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); show(true); return; }
	if (l.hidden) return;
	if (e.key === 'ArrowDown') { e.preventDefault(); hi(i[Math.min(k + 1, i.length - 1)]); }
	if (e.key === 'ArrowUp') { e.preventDefault(); hi(i[Math.max(k - 1, 0)]); }
	if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (k >= 0) choose(i[k]); }
	if (e.key === 'Escape') show(false); });
for (const o of opts()) { o.addEventListener('pointermove', () => hi(o)); o.addEventListener('click', () => choose(o)); }
document.addEventListener('pointerdown', (e) => { if (!l.hidden && !l.contains(e.target) && !t.contains(e.target)) show(false); });
})();`;

const options = (id: string, values: readonly string[], selected = 0) => values.map((v, i) => `<div role="option" id="${id}-${i}" aria-selected="${i === selected}">${v}</div>`).join('');

const FONTS = ['Geist', 'Inter', 'Lora', 'Roboto', 'Manrope'];
const SAMPLES: Record<string, string> = { 'Next.js': 'Load the fonts with next/font in your root layout: import { Geist } from "next/font/google"', Vite: 'pnpm add @fontsource-variable/geist, then import it in your CSS file: @import "@fontsource-variable/geist";' };
const REGISTRIES = ['@magicui', '@aceternity', '@originui', '@kokonut', '@blockdex', '@cult', '@motion-primitives', '@shadcnblocks'];
const LANG: Record<string, string[]> = { English: ['Badge', 'Secondary', 'Outline'], 'Arabic (العربية)': ['شارة', 'ثانوي', 'مخطط'], 'Hebrew (עברית)': ['תג', 'משני', 'קווי מתאר'] };
const TREE = `<ul class="tree"><li><button aria-expanded="true" aria-controls="f-components" data-folder>components</button><ul id="f-components"><li><button aria-expanded="true" aria-controls="f-ui" data-folder>ui</button><ul id="f-ui"><li><button>button.tsx</button></li><li><button>dialog.tsx</button></li></ul></li><li><button>login-form.tsx</button></li></ul></li><li><button aria-expanded="true" aria-controls="f-app" data-folder>app</button><ul id="f-app"><li><button>page.tsx</button></li></ul></li></ul>`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A react-day-picker month grid: one roving day, arrows by day and week, PageUp/PageDown and Shift+arrows by month. */
const calendarScript = (grid: string, input = '', broken: 'shift-left' | 'arrows' | 'parse' | '' = '') => `
(() => { const g = $('${grid}'); let y = 2026, mo = 9, focusDay = 15;
const label = $('${grid}-label');
const render = (focus) => { label.textContent = ${JSON.stringify(MONTHS)}[mo] + ' ' + y; const days = new Date(y, mo + 1, 0).getDate(); const first = new Date(y, mo, 1).getDay();
	let html = '<div role="row">' + '<span></span>'.repeat(first);
	for (let d = 1; d <= days; d++) { if ((first + d - 1) % 7 === 0 && d > 1) html += '</div><div role="row">'; html += '<button role="gridcell" tabindex="' + (d === focusDay ? 0 : -1) + '" data-day="' + d + '" aria-label="' + ${JSON.stringify(MONTHS)}[mo] + ' ' + d + ', ' + y + '"' + (d === focusDay ? ' aria-selected="true"' : '') + '>' + d + '</button>'; }
	g.innerHTML = html + '</div>'; if (focus) g.querySelector('[data-day="' + focusDay + '"]').focus(); };
const move = (days, months) => { if (months) { mo += months; if (mo < 0) { mo = 11; y--; } if (mo > 11) { mo = 0; y++; } focusDay = Math.min(focusDay, new Date(y, mo + 1, 0).getDate()); } else { const d = new Date(y, mo, focusDay + days); y = d.getFullYear(); mo = d.getMonth(); focusDay = d.getDate(); } render(true); };
g.addEventListener('keydown', (e) => { const k = e.key;
	if (k === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); ${broken === 'shift-left' ? "mo -= 1; render(false); document.activeElement.blur();" : 'move(0, -1);'} return; }
	if (k === 'ArrowRight' && e.shiftKey) { e.preventDefault(); move(0, 1); return; }
	${broken === 'arrows' ? '' : "const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k]; if (step) { e.preventDefault(); move(step, 0); return; } if (k === 'Home' || k === 'End') { e.preventDefault(); const wd = new Date(y, mo, focusDay).getDay(); move(k === 'Home' ? -wd : 6 - wd, 0); return; }"}
	if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); move(0, k === 'PageUp' ? -1 : 1); } });
g.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) { focusDay = Number(b.dataset.day); render(true); ${input ? `$('${input}').value = ${JSON.stringify(MONTHS)}[mo] + ' ' + String(focusDay).padStart(2, '0') + ', ' + y;` : ''} } });
${input ? `const field = $('${input}'); const read = () => { const d = new Date(field.value); if (isNaN(d)) { field.setAttribute('aria-invalid', 'true'); return; } field.removeAttribute('aria-invalid'); y = d.getFullYear(); mo = d.getMonth(); focusDay = ${broken === 'parse' ? '1' : 'd.getDate()'}; field.value = ${JSON.stringify(MONTHS)}[mo] + ' ' + String(focusDay).padStart(2, '0') + ', ' + y; render(false); };
field.addEventListener('keydown', (e) => { if (e.key === 'Enter') read(); if (e.key === 'ArrowDown') { e.preventDefault(); read(); $('${grid}-pop').hidden = false; render(true); } });
field.addEventListener('blur', read);` : ''}
render(false); })();`;

const calendar = (id: string) => `<div id="${id}-pop" class="cal"><div><span id="${id}-label" aria-live="polite"></span></div><div role="grid" id="${id}" aria-labelledby="${id}-label"></div></div>`;

export interface Case {
	/** The owner's words, shortened. */
	readonly bug: string;
	readonly route: string;
	/** The original's page and the port's page with the bug put back. */
	readonly old: string;
	readonly mutant: string;
	/** A finding names the bug when its check, expected and actual texts (joined by " | ") match. */
	readonly caught: RegExp;
}

const getStarted = (dead: boolean) =>
	page('Create', `<p>Pick a style, then a base color.</p><button id="customize">Customize</button><p id="out"></p><div id="bd" style="position: fixed; inset: 0; background: rgba(0,0,0,.4)"></div><div role="dialog" aria-modal="true" aria-labelledby="dh" id="welcome" style="position: fixed; inset: 20% 30%; background: white; padding: 24px; border-radius: 8px"><h2 id="dh">Build your own shadcn/ui</h2><p>Pick a style, a color and a font.</p><button id="start">Get Started</button></div>`,
		`$('customize').onclick = () => $('out').textContent = 'Customizing';${dead ? '' : `$('start').onclick = () => { $('welcome').hidden = true; $('bd').hidden = true; $('customize').focus(); };`}`);

const typesetFont = (dead: boolean) =>
	page('Typeset', `<button id="heading" aria-haspopup="menu" aria-expanded="false">Heading <span id="hname">Geist</span> Aa</button>${menu('fonts', FONTS.map((f, i) => `<div role="menuitemradio" aria-checked="${i === 0}">${f}</div>`).join(''))}<article id="preview"><h2 id="ph" style="font-family: Geist, sans-serif">The quick brown fox</h2><p>Jumps over the lazy dog.</p></article>`,
		menuScript('heading', 'fonts', dead ? '' : `(item) => { for (const x of item.parentElement.children) x.setAttribute('aria-checked', String(x === item)); $('hname').textContent = item.textContent; $('ph').style.fontFamily = item.textContent + ', serif'; return true; }`));

const shuffle = (dead: boolean) =>
	page('Typeset', `<p>Heading <b id="h">Geist</b>, body <b id="b">Geist</b>, size <b id="s">15px</b>.</p><button id="shuffle">Shuffle</button>`,
		dead ? '' : `let n = 0; $('shuffle').onclick = () => { n++; $('h').textContent = ${JSON.stringify(FONTS)}[n % 5]; $('b').textContent = ${JSON.stringify(FONTS)}[(n * 3) % 5]; $('s').textContent = (14 + n % 4) + 'px'; };`);

const framework = (labelOnly: boolean) =>
	page('Typeset', `<p>Use the fonts in your framework.</p><button id="fw" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="fwl"><span id="fwv">Next.js</span></button><div class="pop" role="listbox" id="fwl" hidden>${options('fwo', ['Next.js', 'Vite'])}</div><pre id="code">${SAMPLES['Next.js']}</pre>`,
		selectScript('fw', 'fwl', `(o) => { $('fwv').textContent = o.textContent;${labelOnly ? '' : ` $('code').textContent = ${JSON.stringify(SAMPLES)}[o.textContent];`} }`));

const directory = (dead: boolean) =>
	page('Directory', `<label>Search <input id="q" type="search" placeholder="Search registries"></label><p id="count">${REGISTRIES.length} registries</p><ul id="list">${REGISTRIES.map((r) => `<li><a href="/docs">${r}</a></li>`).join('')}</ul>`,
		dead ? '' : `$('q').addEventListener('input', () => { const v = $('q').value.toLowerCase(); let n = 0; for (const li of $('list').children) { li.hidden = !li.textContent.includes(v); if (!li.hidden) n++; } $('count').textContent = n + ' registries'; });`);

// A dropdown whose content animates in and out (Radix + tailwindcss-animate: 100 ms, scale and fade), or not at all.
const ANIMATED = '#m[data-state=open] { animation: enter 150ms ease } #m[data-state=closed] { animation: exit 150ms ease } @keyframes enter { from { opacity: 0; transform: scale(.95) translateY(-8px) } } @keyframes exit { to { opacity: 0; transform: scale(.95) } }';
const SLOW = ANIMATED.replace(/150ms ease/g, '450ms linear');
const dropdown = (title: string, label: string, style: string) =>
	page(title, `<p>Use it as a trigger for a dropdown menu.</p><button id="t" aria-haspopup="menu" aria-expanded="false" aria-label="${label}">${label === 'shadcn' ? '<img alt="" width="32" height="32" style="border-radius: 50%; background: #ccc">' : '…'}</button>${menu('m', '<div role="menuitem">Profile</div><div role="menuitem">Billing</div><div role="menuitem">Settings</div><div role="menuitem">Log out</div>')}`,
		menuScript('t', 'm'), style);

const currency = (broken: boolean) =>
	page('Button Group', `<div style="display: flex; gap: 0"><button id="cur" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Currency"><span id="curv">$</span></button><input aria-label="Amount" placeholder="10.00"></div><div class="pop" role="listbox" id="curl" hidden style="min-width: 140px">${options('co', ['$ US Dollar', '€ Euro', '£ British Pound'])}</div>`,
		selectScript('cur', 'curl', broken ? '' : `(o) => { $('curv').textContent = o.textContent[0]; }`, broken ? -46 : 0));

const rtl = (labelOnly: boolean) =>
	page('Badge', `<h2>RTL</h2><button id="lang" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="langl"><span id="langv">Arabic (العربية)</span></button><div class="pop" role="listbox" id="langl" hidden>${options('lo', Object.keys(LANG), 1)}</div><div id="demo" dir="rtl">${LANG['Arabic (العربية)']!.map((w) => `<span class="badge">${w}</span>`).join(' ')}</div>`,
		selectScript('lang', 'langl', `(o) => { $('langv').textContent = o.textContent;${labelOnly ? '' : ` const words = ${JSON.stringify(LANG)}[o.textContent]; $('demo').dir = o.textContent === 'English' ? 'ltr' : 'rtl'; $('demo').innerHTML = words.map((w) => '<span class="badge">' + w + '</span>').join(' ');`} }`));

// Recharts animates a series' path to its new shape over 400 ms when the shown key changes; the port can jump there.
const morph = (jump: boolean) =>
	page('Bar Chart - Interactive', `<div role="group" aria-label="Series"><button id="desktop" aria-pressed="true" data-active="true">Desktop 24,828</button><button id="mobile" aria-pressed="false">Mobile 25,010</button></div><svg width="600" height="220" viewBox="0 0 600 220"><path id="series" fill="none" stroke="#2563eb" stroke-width="3"/></svg>`,
		`const A = [40, 120, 80, 160, 60, 180, 100], B = [150, 50, 170, 70, 140, 30, 120];
const d = (v) => v.map((y, i) => (i ? 'L' : 'M') + (i * 95 + 15) + ' ' + (210 - y)).join(' ');
let cur = A.slice(); $('series').setAttribute('d', d(cur));
const go = (to) => { ${jump ? "cur = to.slice(); $('series').setAttribute('d', d(cur));" : "const from = cur.slice(), t0 = performance.now(); const f = (now) => { const k = Math.min(1, (now - t0) / 400), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; cur = from.map((v, i) => v + (to[i] - v) * e); $('series').setAttribute('d', d(cur)); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);"} };
for (const [id, data] of [['desktop', A], ['mobile', B]]) $(id).onclick = () => { for (const b of ['desktop', 'mobile']) { $(b).setAttribute('aria-pressed', String(b === id)); $(b).dataset.active = String(b === id); } go(data); };`);

// The charts page's type links swap the gallery in place; the port's swap waits on work the original does not do.
const chartTypes = (slow: boolean) =>
	page('Charts', `<nav aria-label="Chart types"><a href="#area" id="area" aria-current="page">Area Charts</a> <a href="#bar" id="bar">Bar Charts</a> <a href="#line" id="line">Line Charts</a></nav><section id="gallery" aria-label="Gallery"><h2 id="gh">Area Charts</h2><svg width="600" height="200"><rect id="shape" x="10" y="40" width="580" height="150" fill="#93c5fd"/></svg></section>`,
		`const SHAPES = { area: [10, 40, 580, 150], bar: [10, 100, 120, 90], line: [10, 110, 580, 4] };
for (const id of ['area', 'bar', 'line']) $(id).onclick = (e) => { e.preventDefault(); const show = () => { for (const x of ['area', 'bar', 'line']) x === id ? $(x).setAttribute('aria-current', 'page') : $(x).removeAttribute('aria-current'); $('gh').textContent = $(id).textContent; const [x, y, w, h] = SHAPES[id]; Object.assign($('shape').attributes, {}); $('shape').setAttribute('x', x); $('shape').setAttribute('y', y); $('shape').setAttribute('width', w); $('shape').setAttribute('height', h); }; ${slow ? "const until = performance.now() + 450; while (performance.now() < until); show();" : 'show();'} };`);

const download = (dead: boolean) =>
	page('Code Block', `<figure><figcaption>app/api/chat/route.ts</figcaption><button id="dl" aria-label="Download">⤓</button><pre id="src">export async function POST(request) { return new Response("ok") }</pre></figure>`,
		dead ? '' : `$('dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('src').textContent], { type: 'text/plain' })); a.download = 'route.ts'; document.body.append(a); a.click(); a.remove(); };`);

const codeTabs = (stale: boolean) =>
	page('Code Block', `<div role="tablist" aria-label="Files"><button role="tab" id="t1" aria-selected="true" aria-controls="p">route.ts</button><button role="tab" id="t2" aria-selected="false" aria-controls="p" tabindex="-1">chat.tsx</button></div><div role="tabpanel" id="p" aria-labelledby="t1"><pre id="code">export async function POST(request: Request) {}</pre></div>`,
		`const FILES = { 't1': 'export async function POST(request: Request) {}', 't2': 'const { messages } = useChat(); return <MessageList messages={messages} />' };
const pick = (t) => { for (const x of ['t1', 't2']) { $(x).setAttribute('aria-selected', String(x === t.id)); $(x).tabIndex = x === t.id ? 0 : -1; } $('p').setAttribute('aria-labelledby', t.id);${stale ? '' : ' $(\'code\').textContent = FILES[t.id];'} t.focus(); };
for (const t of document.querySelectorAll('[role=tab]')) { t.onclick = () => pick(t); t.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); pick(t.id === 't1' ? $('t2') : $('t1')); } }; }`);

// A recorded reply replayed one token every 40 ms; the port can show it in bursts.
const replay = (bursts: boolean) =>
	page('Code Block', `<div id="msg" aria-live="polite" style="min-height: 120px"></div><button id="replay">Replay</button>`,
		`const TEXT = 'Create a route handler that calls streamText and returns the stream to the client. The useChat hook reads it on the page and renders each part as it arrives, so the answer shows while it is still being written.'.split(' ');
$('msg').textContent = TEXT.join(' ');
$('replay').onclick = () => { $('replay').hidden = true; $('msg').textContent = ''; let i = 0; const step = () => { const n = ${bursts ? 8 : 1}; $('msg').textContent = TEXT.slice(0, i += n).join(' '); if (i < TEXT.length) setTimeout(step, ${bursts ? 320 : 40}); else $('replay').hidden = false; }; step(); };`);

const fileTree = (nestedDead: boolean) =>
	page('File Tree', TREE,
		`for (const b of document.querySelectorAll('[data-folder]')) { if (${nestedDead} && b.closest('ul ul')) continue; b.onclick = () => { const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); $(b.getAttribute('aria-controls')).hidden = !open; }; }`);

const COMBO_STYLE = '[role=option] .check { visibility: hidden; width: 14px } [role=option][aria-selected=true] .check { visibility: visible } #chips { display: flex; gap: 4px; width: 320px; border: 1px solid #999; padding: 2px }';
/** Base UI's Combobox: an input whose list opens under it at its width (or under its chips), a check on the chosen item. */
const combobox = (bug: 'check' | 'narrow' | 'clear' | 'close' | '', preset = false) =>
	page('Combobox', `<div id="chips"><span id="chosen"></span><input id="cb" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cbl" placeholder="Add framework" style="flex: 1; border: 0"><button id="clear" aria-label="Clear" tabindex="-1">×</button></div><div class="pop" role="listbox" id="cbl" hidden>${['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro'].map((v, i) => `<div role="option" id="cbo-${i}" aria-selected="false">${bug === 'check' ? '' : '<svg class="check" viewBox="0 0 16 16" width="14" height="14"><path d="M2 8l4 4 8-8" stroke="currentColor" fill="none"/></svg>'}${v}</div>`).join('')}</div>`,
		`const c = $('cb'), l = $('cbl'), opts = [...l.children];${bug === 'clear' || preset ? " opts[0].setAttribute('aria-selected', 'true');" : ''}
const show = (open) => { if (open) { l.hidden = false; l.dataset.state = 'open'; place(l, $('chips'), ${bug === 'narrow' ? 78 : 0}, 4, ${bug === 'narrow' ? 237 : 320}); } else { l.dataset.state = 'closed'; ${bug === 'close' ? "l.hidden = true;" : "setTimeout(() => { if (l.dataset.state === 'closed') l.hidden = true; }, 150);"} } c.setAttribute('aria-expanded', String(open)); };
const sync = () => { const on = opts.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent); $('chosen').textContent = on.join(', '); };
c.addEventListener('focus', () => show(true)); c.addEventListener('click', () => show(true));
c.addEventListener('input', () => { for (const o of opts) o.hidden = !o.textContent.toLowerCase().includes(c.value.toLowerCase()); });
c.addEventListener('keydown', (e) => { if (e.key === 'Escape') show(false); if (e.key === 'ArrowDown') { e.preventDefault(); show(true); } });
for (const o of opts) o.addEventListener('click', () => { o.setAttribute('aria-selected', String(o.getAttribute('aria-selected') !== 'true')); sync(); c.focus(); });
$('clear').onclick = () => { ${bug === 'clear' ? '' : "for (const o of opts) o.setAttribute('aria-selected', 'false'); c.value = ''; sync();"} };
sync();
document.addEventListener('pointerdown', (e) => { if (l.dataset.state === 'open' && !l.contains(e.target) && !$('chips').contains(e.target)) show(false); });`,
		`${COMBO_STYLE} #cbl[data-state=closed] { opacity: 0; transition: opacity 150ms } #cbl[data-state=open] { opacity: 1; transition: opacity 150ms } @starting-style { #cbl[data-state=open] { opacity: 0 } }`);

// cmdk's palette: a click outside fades the dialog out over 200 ms with its list where the visitor left it.
const palette = (jumps: boolean) =>
	page('Docs', `<button id="search" aria-haspopup="dialog" aria-expanded="false" aria-controls="pal">Search documentation...</button><div role="dialog" aria-modal="true" aria-label="Search documentation" id="pal" class="pop" style="position: fixed; left: 30%; top: 15%; width: 480px" hidden><input id="pq" role="combobox" aria-expanded="true" aria-controls="pl" placeholder="Search..."><div role="listbox" id="pl" style="height: 200px; overflow: auto">${Array.from({ length: 30 }, (_, i) => `<div role="option" id="po-${i}" aria-selected="${i === 0}">Page ${i + 1}</div>`).join('')}</div></div>`,
		`const pal = $('pal'), pl = $('pl');
const close = () => { pal.style.transition = 'opacity 200ms'; pal.style.opacity = '0';${jumps ? " pl.scrollTop = 0;" : ''} setTimeout(() => { pal.hidden = true; pal.style.opacity = ''; pal.style.transition = ''; $('search').setAttribute('aria-expanded', 'false'); $('search').focus(); }, 200); };
$('search').onclick = () => { pal.hidden = false; pl.scrollTop = 0; $('search').setAttribute('aria-expanded', 'true'); $('pq').focus(); };
pal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
document.addEventListener('pointerdown', (e) => { if (!pal.hidden && !pal.contains(e.target)) close(); });`);

// A context menu whose "More Tools" item opens a submenu on hover, ArrowRight, Enter and click, as Radix and Base UI do.
const contextMenu = (subDead: boolean) =>
	page('Context Menu', `<div id="area" style="width: 300px; height: 150px; border: 1px dashed #999; display: grid; place-items: center">Right click here</div>${menu('cm', '<div role="menuitem">Back</div><div role="menuitem">Forward</div><div role="menuitem" id="more" aria-haspopup="menu" aria-expanded="false">More Tools ›</div><div role="menuitem">Reload</div>')}${menu('sub', '<div role="menuitem">Save Page...</div><div role="menuitem">Create Shortcut...</div><div role="menuitem">Developer Tools</div>')}`,
		`const cm = $('cm'), sub = $('sub'), more = $('more');
const items = (m) => [...m.querySelectorAll('[role=menuitem]')];
const closeAll = () => { cm.hidden = true; sub.hidden = true; more.setAttribute('aria-expanded', 'false'); };
const openSub = (focus) => { ${subDead ? '' : "const r = more.getBoundingClientRect(); sub.hidden = false; sub.style.left = r.right + scrollX + 'px'; sub.style.top = r.top + scrollY - 4 + 'px'; more.setAttribute('aria-expanded', 'true'); if (focus) items(sub)[0].focus();"} };
// React's onContextMenu, as Radix's ContextMenu.Trigger sets it: a property on the element, as the probe's handler scan reads it.
$('area').oncontextmenu = (e) => { e.preventDefault(); cm.hidden = false; cm.style.left = e.pageX + 'px'; cm.style.top = e.pageY + 'px'; cm.focus(); };
for (const m of [cm, sub]) { for (const it of items(m)) { it.tabIndex = -1; it.addEventListener('pointermove', () => { it.focus(); if (m === cm) { if (it === more) openSub(false); else { sub.hidden = true; more.setAttribute('aria-expanded', 'false'); } } }); it.addEventListener('click', () => { if (it === more) openSub(true); else closeAll(); }); }
	m.addEventListener('keydown', (e) => { const i = items(m), k = i.indexOf(document.activeElement);
		if (e.key === 'ArrowDown') { e.preventDefault(); i[(k + 1) % i.length].focus(); }
		if (e.key === 'ArrowUp') { e.preventDefault(); i[(k - 1 + i.length) % i.length].focus(); }
		if (e.key === 'ArrowRight' && m === cm && document.activeElement === more) { e.preventDefault(); openSub(true); }
		if (e.key === 'ArrowLeft' && m === sub) { e.preventDefault(); sub.hidden = true; more.setAttribute('aria-expanded', 'false'); more.focus(); }
		if (e.key === 'Enter' && k >= 0) { e.preventDefault(); i[k].click(); }
		if (e.key === 'Escape') closeAll(); }); }
document.addEventListener('pointerdown', (e) => { if (!cm.hidden && !cm.contains(e.target) && !sub.contains(e.target)) closeAll(); });`);

// A tooltip above its trigger, outside the example's clipping box; the port's sits on top of its trigger.
const tooltip = (covers: boolean) =>
	page('Tooltip', `<div style="overflow: hidden; border: 1px solid #ddd; padding: 48px; position: relative"><button id="tip" aria-describedby="tc">Hover</button><div role="tooltip" id="tc" class="pop" hidden style="min-width: 0; padding: 4px 8px; background: #111; color: white">Add to library</div></div>`,
		`const t = $('tip'), c = $('tc'); let timer;
const show = () => { c.hidden = false; const r = t.getBoundingClientRect(); c.style.position = '${covers ? 'absolute' : 'fixed'}'; c.style.left = (${covers ? "t.offsetLeft - 8" : 'r.left + r.width / 2 - c.offsetWidth / 2'}) + 'px'; c.style.top = (${covers ? 't.offsetTop' : 'r.top - c.offsetHeight - 6'}) + 'px'; };
t.addEventListener('pointerenter', () => { timer = setTimeout(show, 300); }); t.addEventListener('pointerleave', () => { clearTimeout(timer); c.hidden = true; });
t.addEventListener('focus', show); t.addEventListener('blur', () => { c.hidden = true; });`);

// A data table's Columns menu: checkbox items toggle a column and keep the menu open, as Base UI's CheckboxItem does.
const columns = (closes: boolean) =>
	page('Data Table', `<button id="cols" aria-haspopup="menu" aria-expanded="false">Columns</button>${menu('cmenu', ['status', 'email', 'amount'].map((c) => `<div role="menuitemcheckbox" aria-checked="true" data-col="${c}">${c}</div>`).join(''))}<table><thead><tr><th data-col="status">Status</th><th data-col="email">Email</th><th data-col="amount">Amount</th></tr></thead><tbody><tr><td data-col="status">success</td><td data-col="email">ken99@example.com</td><td data-col="amount">$316.00</td></tr></tbody></table>`,
		menuScript('cols', 'cmenu', `(item) => { const on = item.getAttribute('aria-checked') !== 'true'; item.setAttribute('aria-checked', String(on)); for (const c of document.querySelectorAll('td[data-col="' + item.dataset.col + '"], th[data-col="' + item.dataset.col + '"]')) c.hidden = !on; return ${!closes}; }`));

const datePicker = (title: string, broken: 'shift-left' | 'arrows' | 'parse' | '') =>
	page(title, `<label for="sub">Subscription Date</label> <input id="sub" placeholder="June 01, 2025" value="October 15, 2026">${calendar('cal')}`, calendarScript('cal', 'sub', broken), '.cal { margin-top: 8px } [role=row] { display: flex } [role=row] > * { width: 36px; height: 32px }');

const dashboard = (dead: boolean) =>
	page('Dashboard', `<button id="search">Search documentation...</button><table><tbody><tr><td><button id="cover">Cover page</button></td><td>Cover page</td><td>In Process</td></tr><tr><td><button id="toc">Table of contents</button></td><td>Table of contents</td><td>Done</td></tr></tbody></table><div role="dialog" aria-label="Search documentation" id="cmd" class="pop" style="position: fixed; left: 30%; top: 20%" hidden><input aria-label="Search" placeholder="Search..."></div><div role="dialog" aria-labelledby="dt" id="drawer" style="position: fixed; right: 0; top: 0; bottom: 0; width: 360px; background: white; border-left: 1px solid #999; padding: 16px" hidden><h2 id="dt"></h2><p>Showing total visitors for the last 6 months.</p><button id="close">Done</button></div>`,
		`$('search').onclick = () => { $('cmd').hidden = false; $('cmd').querySelector('input').focus(); };
$('cmd').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('cmd').hidden = true; $('search').focus(); } });
${dead ? '' : `for (const id of ['cover', 'toc']) $(id).onclick = () => { $('dt').textContent = $(id).textContent; $('drawer').hidden = false; $('close').focus(); };`}
$('close').onclick = () => { $('drawer').hidden = true; };`);

export const CASES: Record<string, Case> = {
	'create-get-started': { bug: "the create route's Get Started button did nothing", route: '/create', old: getStarted(false), mutant: getStarted(true), caught: /^(behaviour|a11y): .*Get Started/ },
	'typeset-font': { bug: 'typeset: changing fonts did not work', route: '/typeset', old: typesetFont(false), mutant: typesetFont(true), caught: /^(behaviour|a11y): .*menuitemradio \"(Inter|Lora|Roboto|Manrope)\"/ },
	'typeset-shuffle': { bug: 'typeset: the Shuffle button did not work', route: '/typeset/shuffle', old: shuffle(false), mutant: shuffle(true), caught: /^(behaviour|a11y): .*Shuffle/ },
	'framework-switch': { bug: 'the Next.js to Vite switch did nothing', route: '/typeset/framework', old: framework(false), mutant: framework(true), caught: /^(behaviour|a11y): .*(Vite|fontsource|next\/font)/ },
	'directory-search': { bug: "the directory page's search filter did not work", route: '/docs/directory', old: directory(false), mutant: directory(true), caught: /^behaviour: .*(Search|registries)/ },
	'avatar-motion': { bug: 'the avatar dropdown animated when the original does not', route: '/docs/components/avatar', old: dropdown('Avatar', 'shadcn', ''), mutant: dropdown('Avatar', 'shadcn', ANIMATED), caught: /^motion: .*shadcn/ },
	'three-dots-motion': { bug: "the breadcrumb and button group three dots menus' animations differed", route: '/docs/components/breadcrumb', old: dropdown('Breadcrumb', 'Toggle menu', ANIMATED), mutant: dropdown('Breadcrumb', 'Toggle menu', SLOW), caught: /^motion: .*Toggle menu/ },
	'currency-select': { bug: "the button group's currency select was anchored wrong and did not select", route: '/docs/components/button-group', old: currency(false), mutant: currency(true), caught: /^(behaviour|a11y): .*(Currency|Euro|British Pound|US Dollar)/ },
	'rtl-language': { bug: 'RTL toggles changed nothing (badge)', route: '/docs/components/badge', old: rtl(false), mutant: rtl(true), caught: /^(behaviour|a11y): .*(English|Hebrew)/ },
	'chart-switch-speed': { bug: 'switching between chart types was slower than the original', route: '/charts', old: chartTypes(false), mutant: chartTypes(true), caught: /^(behaviour|a11y|responsiveness): .*(Bar Charts|Line Charts|Area Charts)/ },
	'chart-morph': { bug: "a chart's paths do not morph between Desktop and Mobile", route: '/charts/bar', old: morph(false), mutant: morph(true), caught: /^motion: .*(Desktop|Mobile)/ },
	'code-download': { bug: "the code block's download icon did not work", route: '/docs/components/code-block', old: download(false), mutant: download(true), caught: /^(behaviour|a11y): .*Download/ },
	'code-tabs': { bug: "the code block's tabs did not work", route: '/docs/components/code-block/tabs', old: codeTabs(false), mutant: codeTabs(true), caught: /^(behaviour|a11y): .*chat\.tsx/ },
	'markdown-replay': { bug: 'the markdown replay was less smooth', route: '/docs/components/code-block/replay', old: replay(false), mutant: replay(true), caught: /^(behaviour|motion): .*Replay/ },
	'file-tree-nested': { bug: "the file tree's nested triggers did not work", route: '/docs/ai-elements/file-tree', old: fileTree(false), mutant: fileTree(true), caught: /^(behaviour|a11y): .*\"ui\"/ },
	'combobox-check': { bug: 'combobox: the check mark is missing', route: '/docs/components/combobox', old: combobox(''), mutant: combobox('check'), caught: /^behaviour: .*option \"[^\"]+\" \[selected\]/ },
	'combobox-narrow': { bug: 'combobox: the Multiple popup is too narrow and anchored wrong', route: '/docs/components/combobox/multiple', old: combobox(''), mutant: combobox('narrow'), caught: /^(behaviour: [^|]*pop-up place|motion: [^|]*frame of listbox)/ },
	'combobox-clear': { bug: 'combobox: the clear button is broken', route: '/docs/components/combobox/clear', old: combobox('', true), mutant: combobox('clear'), caught: /^(behaviour|a11y): .*Clear/ },
	'combobox-close-motion': { bug: 'combobox: no closing animation', route: '/docs/components/combobox/close', old: combobox(''), mutant: combobox('close'), caught: /^motion: [^|]*(closing|closed by|press Escape)/ },
	'palette-click-off': { bug: 'clicking off the command palette moved its list', route: '/docs', old: palette(false), mutant: palette(true), caught: /^(behaviour|motion): .*(Page \d+|listbox|scrolled)/ },
	'context-submenu': { bug: "the context menu's submenus did not open", route: '/docs/components/context-menu', old: contextMenu(false), mutant: contextMenu(true), caught: /^(behaviour|a11y): .*(More Tools|Save Page|Create Shortcut|Developer Tools)/ },
	'tooltip-anchor': { bug: 'a tooltip covered its anchor on hover', route: '/docs/components/tooltip', old: tooltip(false), mutant: tooltip(true), caught: /^(behaviour|a11y|motion): .*(Hover|Add to library)/ },
	'columns-menu': { bug: "the data table's Columns menu closed (or stayed open) unlike the original on a multiselect", route: '/docs/components/data-table', old: columns(false), mutant: columns(true), caught: /^(behaviour|a11y): .*(status|email|amount)/ },
	'date-shift-left': { bug: "the date picker's Shift+Left jumped the month and broke it", route: '/docs/components/date-picker', old: datePicker('Date Picker', ''), mutant: datePicker('Date Picker', 'shift-left'), caught: /^(behaviour|a11y): .*Shift\+ArrowLeft/ },
	'date-arrows': { bug: "the date picker's keyboard navigation broke", route: '/docs/components/date-picker/keys', old: datePicker('Date Picker', ''), mutant: datePicker('Date Picker', 'arrows'), caught: /^(behaviour|a11y): .*(ArrowLeft|ArrowRight|ArrowUp|ArrowDown)/ },
	'date-typed': { bug: 'typing "May 28, 2025" into the date input became May 1', route: '/docs/components/date-picker/input', old: datePicker('Date Picker', ''), mutant: datePicker('Date Picker', 'parse'), caught: /^(behaviour|a11y): .*May 28/ },
	'dashboard-dead': { bug: "the dashboard's Cover page drawer did not open (dropped recordings)", route: '/examples/dashboard', old: dashboard(false), mutant: dashboard(true), caught: /^(behaviour|a11y): .*(Cover page|Table of contents)/ },
};

/** Every route of the micro-site, as the original serves it. */
export const ORIGINAL: Record<string, string> = Object.fromEntries(Object.values(CASES).map((c) => [c.route, c.old]));
