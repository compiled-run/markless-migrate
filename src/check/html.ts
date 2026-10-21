import { journeyNames, pngBytes, pngSize, type Png } from './artifacts.ts';
import { acceptedLabel } from './automatic.ts';
import { headlines, type Sample } from './responsiveness.ts';
import { formatMetric, METRIC_LABEL, type LoadDetail } from './load.ts';
import { partialLine } from './summary.ts';
import type { Box, Failure, LoginResult, Report, ResponsivenessSummary, RouteResult, Shot, SourceLink } from './types.ts';
import type { Filmstrip, MotionInteraction } from './motion.ts';
import { remaining, type Status } from '../status.ts';

const list = (items: readonly string[], cls = '') => `<ul>${items.map((x) => `<li${cls ? ` class="${cls}"` : ''}>${esc(x)}</li>`).join('')}</ul>`;

function network(r: RouteResult): string {
	if (!r.network) return '';
	const { old, new: next, server } = r.network;
	const oldOnly = new Set(old.filter((x) => !next.includes(x)));
	const newOnly = new Set(next.filter((x) => !old.includes(x)));
	const side = (lines: readonly string[], only: Set<string>) => `<ul>${lines.map((x) => `<li${only.has(x) ? ' class="differs"' : ''}><code>${esc(x)}</code></li>`).join('') || '<li>(none)</li>'}</ul>`;
	const recorded = server.old && server.new ? 'browser and server requests' : `browser requests only (server recorder: old ${server.old ? 'on' : 'off'}, new ${server.new ? 'on' : 'off'})`;
	return `<details class="states network"><summary>Network contract: ${old.length} old, ${next.length} new, ${recorded}${oldOnly.size + newOnly.size ? `, ${oldOnly.size + newOnly.size} differ` : ''}</summary><div class="pair"><div><h4>Old</h4>${side(old, oldOnly)}</div><div><h4>New</h4>${side(next, newOnly)}</div></div></details>`;
}

function noise(r: RouteResult): string {
	if (!r.noise) return '';
	const blocked = Object.entries(r.noise.blocked).map(([host, n]) => `${host} (${n} request${n === 1 ? '' : 's'})`);
	if (!r.noise.noisy.length && !blocked.length) return '';
	return `<details class="states"><summary>Noise: ${r.noise.noisy.length} element${r.noise.noisy.length === 1 ? '' : 's'} still varied between old loads${blocked.length ? `, ${blocked.length} tracker host${blocked.length === 1 ? '' : 's'} blocked` : ''}</summary>${r.noise.noisy.length ? `<ul>${r.noise.noisy.map((n) => `<li><strong>${esc(n.element)}</strong> (${esc(n.viewport)}): ${esc(n.why)}</li>`).join('')}</ul>` : ''}${blocked.length ? `<p>Blocked:</p>${list(blocked, 'skipped')}` : ''}</details>`;
}

const ms = (n: number | undefined) => (n === undefined ? '–' : `${n} ms`);
const versus = (w: { old?: number; new?: number } | undefined) => (w ? `${ms(w.old)} → ${ms(w.new)}` : '–');

function responsivenessHeader(summary: ResponsivenessSummary): string {
	const lines = headlines(summary).map((line) => `<p class="headline"><strong>${esc(line)}</strong></p>`).join('');
	const rows = summary.routes
		.map((r) => {
			const i = r.interaction;
			const n = r.navigation;
			return `<tr${r.ok ? '' : ' class="differs"'}><td>${esc(r.route)}${r.role && r.role !== 'anonymous' ? ` <small>as ${esc(r.role)}</small>` : ''}</td><td>${esc(i?.throttled?.control ?? '–')}</td><td>${versus(i?.throttled)}</td><td>${versus(i?.desktop)}</td><td>${esc(n?.throttled?.control ?? '–')}</td><td>${versus(n?.throttled)}</td><td>${versus(n?.desktop)}</td></tr>`;
		})
		.join('');
	const table = rows ? `<table class="timings"><thead><tr><th>Route</th><th>Slowest first interaction</th><th>${summary.cpu}x CPU, mobile</th><th>Desktop</th><th>Slowest navigation</th><th>${summary.cpu}x CPU, mobile</th><th>Desktop</th></tr></thead><tbody>${rows}</tbody></table>` : '';
	return `${lines}${table}<p><small>Each control is used once on a fresh page load, old then new: trusted pointer input to the next frame after the change it causes (Event Timing's duration when that is longer); a link to the next page's first contentful paint. Old against new must stay within max(16 ms, 10%) at both speeds (navigation at ${summary.cpu}x CPU), and a first interaction must answer within ${summary.budgetMs} ms at ${summary.cpu}x CPU and fetch no code. A control fails only when every run of it exceeded.</small></p>`;
}

function sample(s: Sample): string {
	const code = s.fetches.filter((f) => f.kind === 'code');
	const other = s.fetches.length - code.length;
	const bits = [
		s.result === 'none' ? 'no visible change' : s.result === 'reloaded' ? 'full page load' : s.result === 'navigated' ? 'navigated in the page' : '',
		s.warmMs !== undefined ? `second time ${s.warmMs} ms` : '',
		code.length ? `<strong>fetched code: ${code.map((f) => esc(`${f.url} (${(f.bytes / 1024).toFixed(1)} kB)`)).join(', ')}</strong>` : '',
		other ? `${other} other fetch${other === 1 ? '' : 'es'}` : '',
		s.server ? esc(`server ${s.server.ttfb} ms to answer${s.server.warmTtfb !== undefined ? `, ${s.server.warmTtfb} ms again` : ''}, ${(s.server.htmlBytes / 1024).toFixed(1)} kB HTML${s.server.served ? ` (${s.server.served})` : ''}`) : '',
		s.heldBack ? 'a write was held back' : '',
		s.failed ? esc(s.failed) : '',
	].filter(Boolean);
	return `${ms(s.ms)}${bits.length ? ` <small>${bits.join('; ')}</small>` : ''}`;
}

function timings(r: RouteResult): string {
	const t = r.responsiveness;
	if (!t) return '';
	const failing = t.controls.filter((c) => c.speeds.some((x) => !x.ok)).length;
	const rows = t.controls
		.flatMap((c) =>
			c.speeds.map((x) => `<tr${x.ok ? '' : ' class="differs"'}><td>${esc(c.control)} <small>${esc(c.kind)}</small></td><td>${x.speed === 'throttled' ? `${t.cpu}x CPU, mobile` : 'desktop'}</td><td>${x.old.map(sample).join('<br>')}</td><td>${x.new.map(sample).join('<br>')}</td><td>${x.spread ? `old ±${x.spread.old} ms, new ±${x.spread.new} ms` : 'one run'}</td><td>${esc([...x.problems, ...(x.cause ? [`likely cause: ${x.cause}`] : [])].join('; '))}</td></tr>`),
		)
		.join('');
	const left = t.notMeasured.length ? `<p>Not timed:</p>${list(t.notMeasured.map((n) => `${n.control}: ${n.reason}`), 'skipped')}` : '';
	return `<details class="states timings"${failing ? ' open' : ''}><summary>Responsiveness: ${t.controls.length} control${t.controls.length === 1 ? '' : 's'} timed on a fresh load${failing ? `, ${failing} slower` : ''}</summary><table><thead><tr><th>Control</th><th>Speed</th><th>Old</th><th>New</th><th>Between runs</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table>${left}</details>`;
}

function loadStrip(side: string, d: LoadDetail | undefined): string {
	if (!d?.filmstrip?.length) return '';
	return `<div class="strip"><h4>${side}</h4><div class="frames">${d.filmstrip.map((f) => `<figure><img src="${f.image}" loading="lazy" alt="${side} at ${f.ms} ms"><figcaption>${f.ms} ms</figcaption></figure>`).join('')}</div></div>`;
}

function pageLoad(r: RouteResult): string {
	const l = r.load;
	if (!l) return '';
	if (l.skipped) return `<details class="states timings"><summary>Page load (Lighthouse, mobile): not compared</summary><p>${esc(l.skipped)}</p></details>`;
	const failing = l.verdicts.filter((v) => !v.ok).length;
	const rows = l.verdicts.map((v) => `<tr${v.ok ? '' : ' class="differs"'}><td>${esc(METRIC_LABEL[v.metric])}</td><td>${esc(formatMetric(v.metric, v.old))}</td><td>${esc(formatMetric(v.metric, v.new))}</td><td>old ±${esc(formatMetric(v.metric, v.spread.old))}, new ±${esc(formatMetric(v.metric, v.spread.new))}</td><td>${v.ok ? 'ok' : `worse by ${esc(formatMetric(v.metric, v.worse))} (allowed ${esc(formatMetric(v.metric, v.floor))}, p = ${v.p.toFixed(3)})`}</td></tr>`).join('');
	const lcp = (side: string, d: LoadDetail | undefined) => (d?.lcpElement ? `<p><small>${side} LCP element: ${esc(d.lcpElement)}${d.lcpPhases ? `; ${esc(Object.entries(d.lcpPhases).map(([k, v]) => `${k} ${v} ms`).join(', '))}` : ''}</small></p>` : '');
	const strips = l.old.detail?.filmstrip?.length || l.new.detail?.filmstrip?.length ? `<div class="filmstrip"><h3>Page load filmstrip <small>Lighthouse's frames of the median run, unthrottled time</small></h3>${loadStrip('Old', l.old.detail)}${loadStrip('New', l.new.detail)}</div>` : '';
	return `<details class="states timings"${failing ? ' open' : ''}><summary>Page load (Lighthouse, mobile, median of ${l.runs} runs each)${failing ? `: <strong>${failing} metric${failing === 1 ? '' : 's'} worse</strong>` : ''}</summary><table><thead><tr><th>Metric</th><th>Old</th><th>New</th><th>Between runs</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table>${lcp('Old', l.old.detail)}${lcp('New', l.new.detail)}${strips}</details>`;
}

function writes(r: RouteResult): string {
	if (!r.writes?.length) return '';
	return `<details class="states"><summary>Writes: ${r.writes.length}, ${r.writes.filter((w) => !w.sent).length} held back</summary><ul>${r.writes.map((w) => `<li><code>${esc(w.line)}</code> during ${esc(w.during)}: ${esc(w.reason)}${w.sent ? ' (sent)' : ''}</li>`).join('')}</ul></details>`;
}

function run(report: Report): string {
	const parts: string[] = [];
	if (report.pinned?.length) parts.push(`<details class="states"><summary>Frozen in the browser for every load</summary>${list(report.pinned)}</details>`);
	if (report.sources?.length) parts.push(`<details class="states"><summary>Sources of variation in the old app's code: ${report.sources.length}</summary><ul>${report.sources.map((s) => `<li><code>${esc(`${s.file}:${s.line}`)}</code> ${esc(s.what ?? s.kind)}: ${esc(s.pinned)}</li>`).join('')}</ul></details>`);
	if (report.unchecked?.length) parts.push(`<details class="states" open><summary>Not checked, needs a sample: ${report.unchecked.length} source route${report.unchecked.length === 1 ? '' : 's'} (add values to .migrate/samples.json)</summary><ul>${report.unchecked.map((u) => `<li><code>${esc(u.route)}</code> no value for ${esc(u.params.map((p) => `:${p}`).join(', '))}${u.file ? ` <small>${esc(`${u.file}:${u.line}`)}</small>` : ''}</li>`).join('')}</ul></details>`);
	if (report.writes) parts.push(`<p><small>Writes were ${report.writes === 'sent' ? 'sent (both apps are on this machine or marked staging)' : 'held back: neither app received a form post or non-GET request; they are compared as "would POST ..."'}.${report.data ? ` Data: ${report.data.mode === 'record' ? 'recorded from old into' : 'replayed to both apps from'} <code>${esc(report.data.dir)}</code>.` : ''}</small></p>`);
	return parts.join('\n');
}

function link(side: string, l: SourceLink): string {
	const label = `${l.file}${l.line ? `:${l.line}` : ''}`;
	return l.path ? `${side} <a href="vscode://file${encodeURI(l.path)}${l.line ? `:${l.line}${l.column ? `:${l.column}` : ''}` : ''}" title="${esc(`${l.path} (found by ${l.how}); file://${l.path}`)}">${esc(label)}</a>` : `${side} <code title="${esc(`found by ${l.how}`)}">${esc(label)}</code>`;
}

function where(f: Failure): string {
	if (!f.where) return '';
	let html = esc(f.where);
	for (const [side, l] of [['old', f.old], ['new', f.new]] as const) if (l) html = html.replace(esc(`${side} ${l.file}${l.line ? `:${l.line}` : ''}`), link(side, l));
	return `<div class="where">${html}</div>`;
}

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const inline = (image: Png) => `data:image/png;base64,${pngBytes(image).toString('base64')}`;
// Set for the duration of one synchronous renderHtml call.
let png: (image: Png) => string = inline;

function boxes(regions: readonly Box[], width: number, height: number): string {
	const rects = regions.map((r, i) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"><title>Region ${i + 1}: x=${r.x} y=${r.y} ${r.width}x${r.height}</title></rect>`).join('');
	return `<svg class="boxes" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

function figure(caption: string, image: Png, regions: readonly Box[]): string {
	const { width, height } = pngSize(image);
	return `<figure><figcaption>${caption}</figcaption><div class="frame"><img src="${png(image)}" loading="lazy" width="${width}" height="${height}" alt="${esc(caption)} screenshot">${boxes(regions, width, height)}</div></figure>`;
}

function shot(s: Shot, id: string): string {
	const { width, height } = pngSize(s.old);
	const status = s.ok ? 'same pixels outside the noise mask' : `${s.regions.length} region${s.regions.length === 1 ? ' differs' : 's differ'}`;
	return `<div class="shot" data-mode="side" id="${id}">
<h3><span class="badge ${s.ok ? 'pass' : 'fail'}">${s.ok ? 'same' : 'differs'}</span> ${esc(s.label)} <small>${status}</small></h3>
<div class="modes" role="group" aria-label="View for ${esc(s.label)}"><button type="button" data-set="side" aria-pressed="true">Side by side</button><button type="button" data-set="slider" aria-pressed="false">Slider</button><button type="button" data-set="blink" aria-pressed="false">Blink</button></div>
<div class="panel side">${figure('Old', s.old, s.regions)}${figure('New', s.new, s.regions)}${s.diff ? figure('Diff', s.diff, s.regions) : ''}</div>
<div class="panel slider"><div class="frame stack"><img src="${png(s.new)}" loading="lazy" alt="New screenshot"><img class="over" src="${png(s.old)}" loading="lazy" alt="Old screenshot" style="clip-path: inset(0 50% 0 0)">${boxes(s.regions, width, height)}<div class="handle" style="left: 50%"></div></div>
<label>Old on the left of the line, new on the right <input type="range" min="0" max="100" value="50"></label></div>
<div class="panel blink"><div class="frame stack"><img src="${png(s.old)}" loading="lazy" alt="Old screenshot"><img class="over" src="${png(s.new)}" loading="lazy" alt="New screenshot">${boxes(s.regions, width, height)}</div>
<p class="showing" aria-live="polite">Showing old</p></div>
</div>`;
}

function motion(r: RouteResult): string {
	const m = r.motion;
	if (!m) return '';
	const differs = (i: MotionInteraction) => !i.ok || i.reduced?.ok === false;
	const failing = m.interactions.filter(differs).length;
	const sides = (old: readonly string[], next: readonly string[]) => `<div class="pair"><div><h4>Old</h4>${list(old.length ? old : ['(no motion)'])}</div><div><h4>New</h4>${list(next.length ? next : ['(no motion)'])}</div></div>`;
	const item = (i: MotionInteraction) => `<li${differs(i) ? ' class="differs"' : ''}><strong>${esc(i.name)}</strong>${sides(i.old, i.new)}${i.reduced ? `<p><small>With prefers-reduced-motion: reduce${i.reduced.ok ? ', the same on both' : ''}:</small></p>${sides(i.reduced.old, i.reduced.new)}` : ''}</li>`;
	return `<details class="states motion"${failing ? ' open' : ''}><summary>Motion: ${m.checked} interaction${m.checked === 1 ? '' : 's'} recorded, ${m.interactions.length} started a transition or animation${failing ? `, <strong>${failing} move differently</strong>` : ''}${m.skipped.length ? `, ${m.skipped.length} not recorded` : ''}</summary><ul>${[...m.interactions].sort((a, b) => Number(differs(b)) - Number(differs(a))).map(item).join('')}${m.skipped.map((s) => `<li class="skipped">not recorded: ${esc(s)}</li>`).join('')}${(m.unexercised ?? []).map((s) => `<li class="skipped">no recorded interaction ran the old rule ${esc(s)}; the css dimension compares its values</li>`).join('')}</ul></details>`;
}

function filmstrip(f: Filmstrip): string {
	const row = (side: string, frames: readonly Png[]) => `<div class="strip"><h4>${side}</h4><div class="frames">${frames.map((image, k) => `<figure><img src="${png(image)}" loading="lazy" alt="${side} at ${f.offsets[k]} ms"><figcaption>${f.offsets[k]} ms</figcaption></figure>`).join('')}</div></div>`;
	return `<div class="filmstrip"><h3><span class="badge fail">moves differently</span> ${esc(f.label)} <small>frames at the same offsets into the old page's longest animation</small></h3>${row('Old', f.old)}${row('New', f.new)}</div>`;
}

function coverage(r: RouteResult): string {
	const c = r.coverage;
	if (!c) return '';
	const missing = c.total - c.exercised;
	const item = (e: (typeof c.elements)[number]) => {
		const failure = r.failures.find((f) => f.check.startsWith(`not exercised: ${e.element}`));
		const how = e.by ? `exercised by ${e.by}` : e.shared && !failure ? `in a layout shared with ${e.shared}, exercised there` : `not exercised: ${failure?.actual ?? e.reason ?? ''}${failure?.accepted ? ` (${failure.accepted.automatic ? acceptedLabel(failure.accepted) : 'accepted'}: ${failure.accepted.reason})` : ''}`;
		return `<li${!e.by && (!e.shared || failure) && !failure?.accepted ? ' class="differs"' : ''}><strong>${esc(e.element)}</strong> ${esc(how)}${failure ? where(failure) : ''}</li>`;
	};
	return `<details class="states coverage"${missing ? ' open' : ''}><summary>Interactive elements exercised: ${c.exercised} of ${c.total}${missing ? `, <strong>${missing} not exercised</strong>` : ''}${c.skipped ? `, ${c.skipped} keyboard journeys left out for the budget` : ''}${c.sequencesSkipped ? `, ${c.sequencesSkipped} repeated-use sequences left out for the budget` : ''}</summary><ul>${[...c.elements].sort((a, b) => Number(Boolean(a.by || a.shared)) - Number(Boolean(b.by || b.shared))).map(item).join('')}</ul></details>`;
}

function failedJourneys(r: RouteResult): number {
	return journeyNames(r).filter((name) => r.failures.some((f) => f.check.startsWith(name))).length;
}

function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} kB`;
}

function blockedSection(r: RouteResult, index: number): string {
	return `<section class="route" id="route-${index}">
<h2><span class="badge blocked">blocked</span> ${esc(r.route)}${r.role ? ` <small>as ${esc(r.role)}</small>` : ''}</h2>
<p><strong>${esc(r.blocked!.message)}</strong></p>
<p><small>Nothing was compared on this route: the ${r.blocked!.side} app answered with a bot-protection page instead of the route.</small></p>
</section>`;
}

function infrastructureSection(r: RouteResult, index: number): string {
	return `<section class="route" id="route-${index}">
<h2><span class="badge blocked">not checked</span> ${esc(r.route)}${r.role ? ` <small>as ${esc(r.role)}</small>` : ''}</h2>
<p><strong>${esc(r.infrastructure!.message)}</strong></p>
<p><small>Nothing was compared on this route: ${r.infrastructure!.side ? `the ${r.infrastructure!.side} app` : 'an app'} could not be reached or did not answer in time. This is the network's failure, not the app's; check it again.</small></p>
</section>`;
}

function login(l: LoginResult): string {
	const cookies = `<div class="pair"><div><h4>Old</h4>${list(l.cookies.old.length ? l.cookies.old : ['(none)'])}</div><div><h4>New</h4>${list(l.cookies.new.length ? l.cookies.new : ['(none)'])}</div></div>`;
	const rows = l.failures.map((f) => `<tr><td>${esc(f.check)}</td><td><code>${esc(f.expected)}</code></td><td><code>${esc(f.actual)}</code></td><td>${esc(f.hint)}</td></tr>`).join('');
	return `<details class="states login"${l.ok ? '' : ' open'}><summary><span class="badge ${l.ok ? 'pass' : 'fail'}">${l.ok ? 'same' : 'differs'}</span> Signing in as ${esc(l.role)}: cookies it leaves</summary>${cookies}${rows ? `<table><thead><tr><th>Check</th><th>Expected (old)</th><th>Actual (new)</th><th>Fix</th></tr></thead><tbody>${rows}</tbody></table>` : ''}</details>`;
}

function route(r: RouteResult, index: number, forced?: { readonly reason: string; readonly by?: string }): string {
	if (r.blocked) return blockedSection(r, index);
	if (r.infrastructure) return infrastructureSection(r, index);
	const warning = forced ? `<p class="forced"><span class="badge fail">forced, not proven</span> Served from the new app although this check is not green${forced.by ? `; forced by ${esc(forced.by)}` : ''}: ${esc(forced.reason)}</p>` : '';
	const dims = Object.entries(r.dimensions)
		.map(([d, state]) => `<li class="${state}">${esc(d)}</li>`)
		.join('');
	const rows = r.failures
		.map((f) => `<tr${f.accepted ? ' class="accepted"' : ''}><td>${f.accepted ? `<span class="badge accepted">${f.accepted.automatic ? 'accepted automatically' : 'accepted'}</span> ` : ''}${esc(f.dimension)}</td><td>${esc(f.viewport ?? '')}</td><td>${esc(f.check)}${f.id ? `<br><small>id ${esc(f.id)}</small>` : ''}</td><td><code>${esc(f.expected)}</code></td><td><code>${esc(f.actual)}</code></td><td>${f.accepted?.automatic ? `${esc(acceptedLabel(f.accepted))}. Evidence: ${esc(f.accepted.reason)}` : f.accepted ? `Accepted by ${esc(f.accepted.by)} on ${esc(f.accepted.date)}: ${esc(f.accepted.reason)}` : `${esc(f.hint)}${where(f)}`}</td></tr>`)
		.join('');
	const table = r.failures.length
		? `<table><thead><tr><th>Dimension</th><th>Viewport</th><th>Check</th><th>Expected (old)</th><th>Actual (new)</th><th>Fix</th></tr></thead><tbody>${rows}</tbody></table>`
		: '<p>Every check passed.</p>';
	const w = r.weight;
	return `<section class="route" id="route-${index}">
<h2><span class="badge ${r.ok ? 'pass' : 'fail'}">${r.ok ? 'green' : r.notPorted ? 'not ported' : 'red'}</span> ${esc(r.route)}${r.role ? ` <small>as ${esc(r.role)}</small>` : ''}</h2>
${warning}
<ul class="dims" aria-label="Dimensions">${dims}</ul>
<p class="weight">${r.endpoint ? `Not a page: compared as ${esc(r.endpoint)}` : `JavaScript on the wire ${kb(w.old.downloaded)} → ${kb(w.new.downloaded)}, run at load ${kb(w.old.executed)} → ${kb(w.new.executed)} (uncompressed)`}</p>
${r.states ? `<details class="states"><summary>CSS states and conditions from the old stylesheets: ${r.states.checked.length} forced and compared${r.states.skipped.length ? `, ${r.states.skipped.length} not forced` : ''}</summary><ul>${r.states.checked.map((x) => `<li>${esc(x)}</li>`).join('')}${r.states.skipped.map((x) => `<li class="skipped">not forced: ${esc(x)}</li>`).join('')}</ul></details>` : ''}
${network(r)}
${noise(r)}
${writes(r)}
${coverage(r)}
${timings(r)}
${pageLoad(r)}
${motion(r)}
${journeyNames(r).length ? `<details class="states"><summary>Interactions explored on the old page and replayed on the new one: ${journeyNames(r).length}${failedJourneys(r) ? `, ${failedJourneys(r)} differ` : ''}</summary><ul>${journeyNames(r).map((name) => `<li${r.failures.some((f) => f.check.startsWith(name)) ? ' class="differs"' : ''}>${esc(name)}</li>`).join('')}</ul></details>` : ''}
<h3>Failures (${r.failures.filter((f) => !f.accepted).length}${r.failures.some((f) => f.accepted) ? `, and ${r.failures.filter((f) => f.accepted).length} accepted differences` : ''})</h3>
${table}
${r.shots.map((s, i) => shot(s, `route-${index}-shot-${i}`)).join('\n')}
${(r.filmstrips ?? []).map(filmstrip).join('\n')}
</section>`;
}

const STYLE = `
:root { color-scheme: light; --fail: #b3261e; --pass: #1e6b3a; --ink: #1d1d1f; --muted: #5f6368; --line: #d9d9de; }
body { margin: 0; font: 14px/1.45 system-ui, sans-serif; color: var(--ink); background: #fafafa; }
header, section { max-width: 1400px; margin: 0 auto; padding: 16px 24px; }
header { border-bottom: 1px solid var(--line); }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 24px 0 8px; }
h3 { font-size: 15px; margin: 16px 0 8px; }
small, .weight { color: var(--muted); }
.badge { display: inline-block; padding: 1px 8px; border-radius: 10px; color: white; font-size: 12px; font-weight: 600; vertical-align: 2px; }
.badge.pass { background: var(--pass); } .badge.fail { background: var(--fail); } .badge.blocked, .badge.accepted { background: var(--muted); }
.role { border-top: 2px solid var(--ink); margin-top: 24px; }
.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 0; list-style: none; }
.toc a { color: inherit; }
.dims { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; list-style: none; }
.dims li { padding: 1px 8px; border-radius: 4px; border: 1px solid var(--line); }
.dims li.fail { border-color: var(--fail); color: var(--fail); font-weight: 600; }
.dims li.pass { color: var(--pass); }
table { border-collapse: collapse; width: 100%; background: white; }
th, td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
td code { white-space: pre-wrap; word-break: break-word; font-size: 12px; }
.shot { margin: 16px 0 28px; padding: 12px; background: white; border: 1px solid var(--line); border-radius: 8px; }
.modes { display: flex; gap: 6px; margin-bottom: 10px; }
.modes button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: white; cursor: pointer; }
.modes button[aria-pressed="true"] { background: var(--ink); color: white; border-color: var(--ink); }
.panel { display: none; }
.shot[data-mode="side"] .side { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
.shot[data-mode="slider"] .slider, .shot[data-mode="blink"] .blink { display: block; max-width: 900px; }
figure { margin: 0; }
figcaption { font-weight: 600; margin-bottom: 4px; }
.frame { position: relative; border: 1px solid var(--line); line-height: 0; }
.frame img { width: 100%; height: auto; display: block; }
.stack .over { position: absolute; inset: 0; }
.blink .stack .over { visibility: hidden; }
.blink .stack.flip .over { visibility: visible; }
.boxes { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.boxes rect { fill: rgb(179 38 30 / 0.08); stroke: var(--fail); stroke-width: 3; vector-effect: non-scaling-stroke; }
.handle { position: absolute; top: 0; bottom: 0; width: 2px; background: #1a73e8; pointer-events: none; }
.slider label { display: block; margin-top: 8px; }
.slider input { width: 100%; }
.filmstrip { margin: 16px 0 28px; padding: 12px; background: white; border: 1px solid var(--line); border-radius: 8px; } .filmstrip .frames { display: flex; gap: 8px; overflow-x: auto; } .filmstrip figure { margin: 0; } .filmstrip img { display: block; border: 1px solid var(--line); max-height: 320px; } .filmstrip figcaption { color: var(--muted); font-size: 12px; text-align: center; }
.pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .pair h4 { margin: 8px 0 4px; } .network code { font-size: 12px; word-break: break-all; }
.where { margin-top: 6px; color: var(--muted); } .where a { color: #1a73e8; }
.forced { color: var(--fail); font-weight: 600; } tr.forced td { background: rgb(179 38 30 / 0.06); }
.states { margin: 8px 0; } .states .skipped { color: var(--muted); } .states .differs { color: var(--fail); font-weight: 600; }
`;

const SCRIPT = `
for (const shot of document.querySelectorAll('.shot')) {
	let timer;
	const blink = shot.querySelector('.blink .stack');
	const showing = shot.querySelector('.showing');
	const setMode = (mode) => {
		shot.dataset.mode = mode;
		for (const b of shot.querySelectorAll('[data-set]')) b.setAttribute('aria-pressed', String(b.dataset.set === mode));
		clearInterval(timer);
		if (mode === 'blink') timer = setInterval(() => {
			blink.classList.toggle('flip');
			showing.textContent = blink.classList.contains('flip') ? 'Showing new' : 'Showing old';
		}, 600);
	};
	for (const b of shot.querySelectorAll('[data-set]')) b.addEventListener('click', () => setMode(b.dataset.set));
	const range = shot.querySelector('.slider input');
	const over = shot.querySelector('.slider .over');
	const handle = shot.querySelector('.slider .handle');
	range.addEventListener('input', () => {
		over.style.clipPath = 'inset(0 ' + (100 - Number(range.value)) + '% 0 0)';
		handle.style.left = range.value + '%';
	});
}
`;

const STATE_CLASS: Record<Status['routes'][number]['state'], string> = { green: 'pass', red: 'fail', 'not ported': 'fail', blocked: 'blocked', unreachable: 'blocked', unchecked: 'blocked', 'needs a sample': 'blocked' };

function acceptedNote(accepted: readonly string[]): string {
	const automatic = accepted.filter((a) => a.startsWith('accepted automatically'));
	const people = accepted.length - automatic.length;
	return [people ? `${people} accepted by a person` : '', automatic.length ? `${automatic.length} accepted automatically (${[...new Set(automatic.map((a) => a.slice('accepted automatically: '.length).split(': ')[0]))].join('; ')})` : ''].filter(Boolean).join(', ');
}

/** Every route of the plan with how far it has come: green, red, not ported or not checked, and whether it is switched or forced. */
export function migrationSection(s: Status): string {
	if (!s.routes.length) return '';
	const rows = s.routes.map((r) => {
		const served = r.forced ? `<span class="badge fail">forced, not proven</span> ${esc(r.forced.reason)}${r.forced.by ? ` <small>(${esc(r.forced.by)})</small>` : ''}` : r.switched ? 'switched to the new app' : 'old app';
		return `<tr${r.forced ? ' class="forced"' : ''}><td><span class="badge ${STATE_CLASS[r.state]}">${esc(r.state)}</span></td><td><code>${esc(r.route)}</code></td><td>${served}</td><td>${r.coverage ? `${r.coverage.exercised} of ${r.coverage.total}` : ''}</td><td>${esc(r.red.join(', '))}${r.accepted?.length ? `${r.red.length ? '<br>' : ''}<small>${esc(acceptedNote(r.accepted))}</small>` : ''}</td></tr>`;
	});
	const head = s.done ? '<strong>Migration done:</strong> every planned route is green and switched.' : `<strong>Migration not done:</strong> ${esc(remaining(s))}.`;
	return `<section class="migration"><h2>Every planned route</h2><p>${head}</p><table><thead><tr><th>State</th><th>Route</th><th>Served by</th><th>Interactions exercised</th><th>Red</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>`;
}

/** `image` turns a screenshot into the img src: inline by default; writeReport stores each one once, next to the page. `status` adds every planned route, checked in this run or not. */
export function renderHtml(report: Report, image: (image: Png) => string = inline, status?: Status): string {
	png = image;
	try {
		return renderPage(report, status);
	} finally {
		png = inline;
	}
}

function renderPage(report: Report, status?: Status): string {
	const forced = new Map((status?.routes ?? []).filter((r) => r.forced).map((r) => [r.route, r.forced!]));
	const green = report.routes.filter((r) => r.ok).length;
	const key = (r: RouteResult) => (r.role && r.role !== 'anonymous' ? `${r.route} as ${r.role}` : r.route);
	const badge = (r: RouteResult) => `${r.blocked ? '<span class="badge blocked">blocked</span>' : r.infrastructure ? '<span class="badge blocked">not checked</span>' : `<span class="badge ${r.ok ? 'pass' : 'fail'}">${r.ok ? 'green' : r.notPorted ? 'not ported' : 'red'}</span>`}${forced.has(key(r)) ? ' <span class="badge fail">forced, not proven</span>' : ''}`;
	const tocItems = (items: readonly [RouteResult, number][]) => items.map(([r, i]) => `<li><a href="#route-${i}">${badge(r)} ${esc(r.route)}</a></li>`).join('');
	const indexed = report.routes.map((r, i) => [r, i] as [RouteResult, number]);
	const groups = report.roles ? report.roles.map((role) => ({ role, items: indexed.filter(([r]) => r.role === role) })) : [{ role: undefined, items: indexed }];
	const toc = report.roles ? groups.map((g) => `<li>As ${esc(g.role!)}: <ul class="toc">${tocItems(g.items)}</ul></li>`).join('') : tocItems(indexed);
	const body = groups.map((g) => {
		const signIn = report.logins?.find((l) => l.role === g.role);
		const head = g.role ? `<section class="role"><h2>As ${esc(g.role)}</h2>${signIn ? login(signIn) : ''}${!g.items.length && signIn ? '<p>Not checked: signing in on the old app failed.</p>' : ''}</section>\n` : '';
		return head + g.items.map(([r, i]) => route(r, i, forced.get(key(r)))).join('\n');
	}).join('\n');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${report.ok ? (report.unchecked?.length ? 'Unchecked routes' : 'Green') : report.partial && report.checkedOk ? 'Partial' : 'Red'}: old vs new, ${green} of ${report.routes.length} routes green${report.unchecked?.length ? `, ${report.unchecked.length} not checked` : ''}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<h1>Old vs new</h1>
<p>Old <code>${esc(report.old)}</code> against new <code>${esc(report.new)}</code>, checked ${esc(report.startedAt)}. <strong>${green} of ${report.routes.length} routes green${report.unchecked?.length ? `, ${report.unchecked.length} not checked (needs a sample)` : ''}.</strong></p>
${report.partial ? `<p><strong>${esc(partialLine(report.partial))}</strong></p>` : ''}
${report.coverage ? `<p><strong>Routes ported: ${report.coverage.present} of ${report.coverage.total} routes of the old site${report.coverage.missing.length ? `, ${report.coverage.missing.length} missing on the new app` : ''}${report.coverage.servedByOld?.length ? `, ${report.coverage.servedByOld.length} served by the old app` : ''}${report.coverage.accepted.length ? `, ${report.coverage.accepted.length} left out on purpose (accepted)` : ''}.</strong></p>${report.coverage.failures.length ? `<details${report.coverage.missing.length || report.coverage.servedByOld?.length ? ' open' : ''}><summary>Routes the new app lacks or serves from the old app</summary><ul>${report.coverage.failures.map((f) => `<li><code>${esc(f.route)}</code>${f.role ? ` (${esc(f.role)})` : ""} old ${esc(f.expected)}, new ${esc(f.actual)}${f.accepted ? ` (accepted: ${esc(f.accepted.reason)})` : f.id ? ` [${esc(f.id)}]` : ''}</li>`).join('')}</ul></details>` : ''}` : ''}
${report.templates ? `<p>Every page got every check except visual, behaviour and responsiveness, which ran on one representative per template group (by URL pattern and page layout): ${report.templates.groups.map((g) => `<code>${esc(g.pattern)}</code> ${g.members.length} pages, on ${esc(g.representative)}`).join('; ')}.</p>` : ''}
${report.responsiveness ? responsivenessHeader(report.responsiveness) : ''}
${run(report)}
<p><small>Red boxes mark where the screenshots differ outside the noise mask. Slider: drag to wipe between old (left of the line) and new. Blink: alternates old and new in place.</small></p>
${report.staleAccepts?.length ? `<p><strong>Accepted differences that no longer match anything</strong> (remove them from .migrate/accepted.json):</p><ul>${report.staleAccepts.map((a) => `<li>${esc(a.route)} ${esc(a.dimension)}: ${esc(a.check)}: ${esc(a.reason)}</li>`).join('')}</ul>` : ''}
<ul class="toc">${toc}</ul>
${status ? migrationSection(status) : ''}
</header>
<main>
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** The front door's index page: every planned route, what serves it, and what is not ported yet. */
export function renderStatusPage(status: Status, origins: { readonly old: string; readonly new: string }): string {
	const missing = status.routes.filter((r) => r.state === 'not ported' || r.state === 'unchecked' || r.state === 'needs a sample');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${status.done ? 'Migration done' : 'Migration in progress'}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<h1>Migration to Markless</h1>
<p>Old app <code>${esc(origins.old)}</code>, new app <code>${esc(origins.new)}</code>. Switched routes are served by the new app, every other route by the old one.</p>
<p><strong>${status.coverage ? `Routes ported: ${status.coverage.ported} of ${status.coverage.total} routes of the old site${status.coverage.missing.length ? `, ${status.coverage.missing.length} missing on the new app` : ''}${status.coverage.servedByOld.length ? `, ${status.coverage.servedByOld.length} served by the old app` : ''}.` : 'Routes ported: not measured yet.'}</strong></p>
${missing.length ? `<h2>Not ported yet</h2><ul>${missing.map((r) => `<li><code>${esc(r.route)}</code> ${esc(r.state)}</li>`).join('')}</ul>` : ''}
${migrationSection(status)}
</header>
</body>
</html>
`;
}
