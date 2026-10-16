import type { Box, Report, RouteResult, Shot } from './types.ts';

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const png = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

function size(buffer: Buffer): { width: number; height: number } {
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function boxes(regions: readonly Box[], width: number, height: number): string {
	const rects = regions.map((r, i) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"><title>Region ${i + 1}: x=${r.x} y=${r.y} ${r.width}x${r.height}</title></rect>`).join('');
	return `<svg class="boxes" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

function figure(caption: string, image: Buffer, regions: readonly Box[]): string {
	const { width, height } = size(image);
	return `<figure><figcaption>${caption}</figcaption><div class="frame"><img src="${png(image)}" width="${width}" height="${height}" alt="${esc(caption)} screenshot">${boxes(regions, width, height)}</div></figure>`;
}

function shot(s: Shot, id: string): string {
	const { width, height } = size(s.old);
	const status = s.ok ? 'same pixels outside the noise mask' : `${s.regions.length} region${s.regions.length === 1 ? ' differs' : 's differ'}`;
	return `<div class="shot" data-mode="side" id="${id}">
<h3><span class="badge ${s.ok ? 'pass' : 'fail'}">${s.ok ? 'same' : 'differs'}</span> ${esc(s.label)} <small>${status}</small></h3>
<div class="modes" role="group" aria-label="View for ${esc(s.label)}"><button type="button" data-set="side" aria-pressed="true">Side by side</button><button type="button" data-set="slider" aria-pressed="false">Slider</button><button type="button" data-set="blink" aria-pressed="false">Blink</button></div>
<div class="panel side">${figure('Old', s.old, s.regions)}${figure('New', s.new, s.regions)}${s.diff ? figure('Diff', s.diff, s.regions) : ''}</div>
<div class="panel slider"><div class="frame stack"><img src="${png(s.new)}" alt="New screenshot"><img class="over" src="${png(s.old)}" alt="Old screenshot" style="clip-path: inset(0 50% 0 0)">${boxes(s.regions, width, height)}<div class="handle" style="left: 50%"></div></div>
<label>Old on the left of the line, new on the right <input type="range" min="0" max="100" value="50"></label></div>
<div class="panel blink"><div class="frame stack"><img src="${png(s.old)}" alt="Old screenshot"><img class="over" src="${png(s.new)}" alt="New screenshot">${boxes(s.regions, width, height)}</div>
<p class="showing" aria-live="polite">Showing old</p></div>
</div>`;
}

function failedJourneys(r: RouteResult): number {
	return r.journeys?.filter((j) => r.failures.some((f) => f.check.startsWith(j.name))).length ?? 0;
}

function kb(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} kB`;
}

function route(r: RouteResult, index: number): string {
	const dims = Object.entries(r.dimensions)
		.map(([d, state]) => `<li class="${state}">${esc(d)}</li>`)
		.join('');
	const rows = r.failures
		.map((f) => `<tr><td>${esc(f.dimension)}</td><td>${esc(f.viewport ?? '')}</td><td>${esc(f.check)}</td><td><code>${esc(f.expected)}</code></td><td><code>${esc(f.actual)}</code></td><td>${esc(f.hint)}</td></tr>`)
		.join('');
	const table = r.failures.length
		? `<table><thead><tr><th>Dimension</th><th>Viewport</th><th>Check</th><th>Expected (old)</th><th>Actual (new)</th><th>Fix</th></tr></thead><tbody>${rows}</tbody></table>`
		: '<p>Every check passed.</p>';
	const w = r.weight;
	return `<section class="route" id="route-${index}">
<h2><span class="badge ${r.ok ? 'pass' : 'fail'}">${r.ok ? 'green' : 'red'}</span> ${esc(r.route)}</h2>
<ul class="dims" aria-label="Dimensions">${dims}</ul>
<p class="weight">JavaScript on the wire ${kb(w.old.downloaded)} → ${kb(w.new.downloaded)}, run at load ${kb(w.old.executed)} → ${kb(w.new.executed)} (uncompressed)</p>
${r.states ? `<details class="states"><summary>CSS states and conditions from the old stylesheets: ${r.states.checked.length} forced and compared${r.states.skipped.length ? `, ${r.states.skipped.length} not forced` : ''}</summary><ul>${r.states.checked.map((x) => `<li>${esc(x)}</li>`).join('')}${r.states.skipped.map((x) => `<li class="skipped">not forced: ${esc(x)}</li>`).join('')}</ul></details>` : ''}
${r.journeys?.length ? `<details class="states"><summary>Interactions explored on the old page and replayed on the new one: ${r.journeys.length}${failedJourneys(r) ? `, ${failedJourneys(r)} differ` : ''}</summary><ul>${r.journeys.map((j) => `<li${r.failures.some((f) => f.check.startsWith(j.name)) ? ' class="differs"' : ''}>${esc(j.name)}</li>`).join('')}</ul></details>` : ''}
<h3>Failures (${r.failures.length})</h3>
${table}
${r.shots.map((s, i) => shot(s, `route-${index}-shot-${i}`)).join('\n')}
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
.badge.pass { background: var(--pass); } .badge.fail { background: var(--fail); }
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

export function renderHtml(report: Report): string {
	const green = report.routes.filter((r) => r.ok).length;
	const toc = report.routes.map((r, i) => `<li><a href="#route-${i}"><span class="badge ${r.ok ? 'pass' : 'fail'}">${r.ok ? 'green' : 'red'}</span> ${esc(r.route)}</a></li>`).join('');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${report.ok ? 'Green' : 'Red'}: old vs new, ${green} of ${report.routes.length} routes green</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<h1>Old vs new</h1>
<p>Old <code>${esc(report.old)}</code> against new <code>${esc(report.new)}</code>, checked ${esc(report.startedAt)}. <strong>${green} of ${report.routes.length} routes green.</strong></p>
<p><small>Red boxes mark where the screenshots differ outside the noise mask. Slider: drag to wipe between old (left of the line) and new. Blink: alternates old and new in place.</small></p>
<ul class="toc">${toc}</ul>
</header>
<main>
${report.routes.map(route).join('\n')}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
