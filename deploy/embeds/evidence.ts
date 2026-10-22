// Builds the embed evidence site from the live checks: node deploy/embeds/evidence.ts <evidence dir> <out dir>
// <evidence dir>/<site>/report-<route>.json and <site>/<route>/<embed>/ (old, new, diff pictures and result.json, from
// check --only embeds), <evidence dir>/recordings/ (record.ts) and psi.json ({ before, after } lines from psi.ts).
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error('usage: evidence.ts <evidence dir> <out dir>');

interface Visual { viewport: string; scheme: string; state: string; differing: number; area: number; ok: boolean; files?: string[] }
interface Activation { navigations: string[]; frames: string[]; playing: boolean; error?: string }
interface Result { name: string; route: string; kind: string; visual: Visual[]; activation: { viewport: string; how: string; ok: boolean; old: Activation; new: Activation }[] }
interface Psi { label: string; url: string; bytes: number; requests: number; fcpMs: number; lcpMs: number; speedIndexMs: number; tbtMs: number; score: number }

const SITES: Record<string, { old: string; new: string; name: string }> = {
	htmx: { name: 'htmx.org', old: 'https://htmx.org', new: 'https://mm-htmx-org-new.vercel.app' },
	vite: { name: 'vite.dev', old: 'https://vite-dev-old.vercel.app', new: 'https://vite-dev-markless.vercel.app' },
	docusaurus: { name: 'docusaurus.io', old: 'https://mm-docusaurus-old.vercel.app', new: 'https://mm-docusaurus-embeds.vercel.app' },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const act = (a: Activation) => esc([a.error ?? '', a.frames.length ? `in its place: ${a.frames.join(', ')}` : 'nothing loads in its place', a.playing ? 'plays' : 'does not play', a.navigations.length ? `opens ${a.navigations.join(', ')}` : 'opens nothing'].filter(Boolean).join('; '));

await mkdir(out, { recursive: true });
const sections: string[] = [];
for (const [site, info] of Object.entries(SITES)) {
	const root = join(dir, site);
	if (!existsSync(root)) continue;
	for (const routeDir of (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name)) {
		const route = routeDir.replaceAll('_', '/');
		const report = existsSync(join(root, `report-${routeDir}.json`)) ? (JSON.parse(await readFile(join(root, `report-${routeDir}.json`), 'utf8')) as { routes: { failures: { check: string; viewport?: string; accepted?: { automatic?: string; reason: string } }[] }[] }) : undefined;
		const accepted = new Map((report?.routes ?? []).flatMap((r) => r.failures.filter((f) => f.accepted?.automatic).map((f) => [`${f.viewport}|${f.check}`, f.accepted!.reason] as const)));
		for (const embed of await readdir(join(root, routeDir))) {
			if (!existsSync(join(root, routeDir, embed, 'result.json'))) continue;
			const result = JSON.parse(await readFile(join(root, routeDir, embed, 'result.json'), 'utf8')) as Result;
			if (result.route !== route) continue;
			const target = join(out, site, routeDir, embed);
			await mkdir(target, { recursive: true });
			await cp(join(root, routeDir, embed), target, { recursive: true });
			const rows = result.visual.map((v) => {
				const base = `${site}/${routeDir}/${embed}/${v.viewport}-${v.scheme}-${v.state}`;
				const img = (kind: string) => (existsSync(join(out, `${base}-${kind}.png`)) ? `<img loading="lazy" src="${base}-${kind}.png" alt="${kind}">` : '<span class="none">(none: identical)</span>');
				const live = !v.ok ? accepted.get(`${v.viewport}|embed ${embed} ${v.scheme} ${v.state}`) : undefined;
				return `<tr class="${v.ok ? 'ok' : live ? 'live' : 'red'}"><td>${v.viewport}</td><td>${v.scheme}</td><td>${v.state}</td><td>${v.differing}${v.area ? ` of ${v.area} (${((100 * v.differing) / v.area).toFixed(3)}%)` : ' (drawn nowhere on either side)'}</td><td>${v.ok ? 'same' : live ? `only the live count differs, accepted automatically: ${esc(live)}` : 'differs'}</td><td>${img('old')}</td><td>${img('new')}</td><td>${img('diff')}</td></tr>`;
			});
			const acts = result.activation.map((a) => `<tr class="${a.ok ? 'ok' : 'red'}"><td>${a.viewport}</td><td>${a.how}</td><td>${act(a.old)}</td><td>${act(a.new)}</td><td>${a.ok ? 'same' : 'differs'}</td></tr>`);
			const rec = join(dir, 'recordings', `${embed}-activation.json`);
			let recording = '';
			if (existsSync(rec)) {
				await mkdir(join(out, 'recordings'), { recursive: true });
				for (const f of (await readdir(join(dir, 'recordings'))).filter((f) => f.startsWith(`${embed}-`))) await cp(join(dir, 'recordings', f), join(out, 'recordings', f));
				const r = JSON.parse(await readFile(rec, 'utf8')) as { url: string; after: { frames: string[]; playing: boolean; currentTime: number | null; opened: string[] } };
				recording = `<p>Recording on the live page (${esc(r.url)}): <a href="recordings/${embed}-activation.webm">video of the click</a>; before the click nothing of the provider's frame is on the page; after it: ${r.after.frames.length ? `frame ${esc(r.after.frames.join(', '))}` : 'no frame'}${r.after.playing ? `, playing (at ${r.after.currentTime?.toFixed(1)} s eight seconds later)` : ''}${r.after.opened.length ? `, opened ${esc(r.after.opened.join(', '))}` : ''}.</p><p><img src="recordings/${embed}-before-click.png" alt="before"> <img src="recordings/${embed}-after-click.png" alt="after"></p>`;
			}
			const pass = result.visual.filter((v) => v.ok).length;
			const drift = result.visual.filter((v) => !v.ok && accepted.has(`${v.viewport}|embed ${embed} ${v.scheme} ${v.state}`)).length;
			sections.push(`<section><h2>${esc(info.name)} ${esc(route)}: ${esc(embed)}</h2><p>Old: <a href="${info.old}${route}">${info.old}${route}</a>. New: <a href="${info.new}${route}">${info.new}${route}</a>. Pictures the same: ${pass} of ${result.visual.length}${drift ? `, ${drift} more differing only in the star count the provider moved since the component's data was read (accepted automatically)` : ''}; activation the same: ${result.activation.filter((a) => a.ok).length} of ${result.activation.length}.</p><table><tr><th>viewport</th><th>scheme</th><th>state</th><th>differing pixels</th><th></th><th>old (the live embed)</th><th>new (the Markless component)</th><th>diff</th></tr>${rows.join('')}</table><h3>Activation, by a click on its middle and by Enter on its first control</h3><table><tr><th>viewport</th><th>how</th><th>old</th><th>new</th><th></th></tr>${acts.join('')}</table>${recording}</section>`);
		}
	}
}
const psiFile = join(dir, 'psi.json');
let psi = '';
if (existsSync(psiFile)) {
	const lines = JSON.parse(await readFile(psiFile, 'utf8')) as { page: string; before: Psi; after: Psi }[];
	const kb = (n: number) => `${Math.round(n / 1024)} kB`;
	const cell = (b: number, a: number, f: (n: number) => string) => `<td>${f(b)}</td><td>${f(a)}</td>`;
	psi = `<section><h2>PageSpeed Insights, mobile, median of 5 runs each</h2><p>Before: the same port built from main without this change, deployed on its own project. After: this change, deployed. Each pair differs only by the embeds.</p><table><tr><th>page</th><th>bytes before</th><th>after</th><th>requests before</th><th>after</th><th>FCP before</th><th>after</th><th>LCP before</th><th>after</th><th>Speed Index before</th><th>after</th><th>TBT before</th><th>after</th><th>score before</th><th>after</th></tr>${lines.map((l) => `<tr><td><a href="${l.before.url}">before</a> / <a href="${l.after.url}">after</a> ${esc(l.page)}</td>${cell(l.before.bytes, l.after.bytes, kb)}${cell(l.before.requests, l.after.requests, String)}${cell(l.before.fcpMs, l.after.fcpMs, (n) => `${n} ms`)}${cell(l.before.lcpMs, l.after.lcpMs, (n) => `${n} ms`)}${cell(l.before.speedIndexMs, l.after.speedIndexMs, (n) => `${n} ms`)}${cell(l.before.tbtMs, l.after.tbtMs, (n) => `${n} ms`)}${cell(l.before.score, l.after.score, (n) => String(Math.round(n * 100)))}</tr>`).join('')}</table></section>`;
}
await writeFile(join(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>markless-migrate: embeds, old against new</title><meta name="viewport" content="width=device-width"><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;max-width:1500px}table{border-collapse:collapse;margin:8px 0 24px}td,th{border:1px solid #ccc;padding:4px 8px;vertical-align:top;text-align:left}tr.red td{background:#fee}tr.live td{background:#ffd}img{max-width:360px;image-rendering:pixelated;border:1px solid #ddd}.none{color:#888}h2{margin-top:40px}</style></head><body><h1>Third-party embeds: the live old embed against the Markless component in its place</h1><p>From <code>markless-migrate check --only embeds</code> against the live old and new pages, the activation recordings from <code>deploy/embeds/record.ts</code>, and PageSpeed Insights. A row is red where the checker found the pictures or the activation different.</p>${psi}${sections.join('\n')}</body></html>\n`);
console.log(`wrote ${join(out, 'index.html')} with ${sections.length} embeds`);
