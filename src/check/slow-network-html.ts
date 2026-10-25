import { CLICK_EVERY_MS, formatValue, RUN_METRIC_LABEL, RUN_METRICS, type NetworkRun, type SideNetwork } from './slow-network.ts';
import { NETWORK_PROFILES } from './throttle.ts';

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

const STYLE = `body{font:14px/1.45 system-ui,sans-serif;margin:2rem auto;max-width:72rem;padding:0 1rem;color:#1a1a1a}
table{border-collapse:collapse;margin:.5rem 0 1rem}th,td{padding:.25rem .6rem;border-bottom:1px solid #ddd;text-align:right}th:first-child,td:first-child{text-align:left}
.timeline{position:relative;margin:.25rem 0 1.5rem;font:12px/1.2 ui-monospace,monospace}.row{position:relative;height:16px;margin:1px 0}
.bar{position:absolute;top:2px;height:12px;border-radius:2px;opacity:.85}.label{position:absolute;left:0;top:1px;white-space:nowrap;overflow:hidden;max-width:36%;color:#333}
.track{position:absolute;left:37%;right:0;top:0;bottom:0}.mark{position:absolute;top:0;bottom:0;width:2px}.mark.paint{background:#2a7}.mark.answer{background:#d33}
.document{background:#57a}.stylesheet{background:#a6c}.script{background:#e9a23b}.font{background:#3aa}.image{background:#9b6}.fetch,.xhr,.other{background:#999}
small{color:#666}`;

function timeline(run: NetworkRun, name: string): string {
	const end = Math.max(run.answered ?? 0, ...run.requests.map((r) => r.end), 1);
	const pct = (ms: number) => ((100 * Math.max(0, ms)) / end).toFixed(2);
	const path = (url: string) => {
		try {
			const u = new URL(url);
			return `${u.host === new URL(run.requests[0]?.url ?? url).host ? '' : u.host}${u.pathname}${u.search}`;
		} catch {
			return url;
		}
	};
	const rows = run.requests
		.map((r) => `<div class="row" title="${esc(`${r.url}: ${seconds(r.start)} to ${seconds(r.end)}, ${(r.bytes / 1000).toFixed(1)} kB`)}"><span class="label">${esc(path(r.url))} ${(r.bytes / 1000).toFixed(1)} kB</span><div class="track"><div class="bar ${esc(r.type)}" style="left:${pct(r.start)}%;width:${(Number(pct(r.end)) - Number(pct(r.start))).toFixed(2)}%"></div></div></div>`)
		.join('');
	const marks = [
		run.firstFrame !== undefined ? `<div class="mark paint" style="left:${pct(run.firstFrame)}%" title="first painted frame ${seconds(run.firstFrame)}"></div>` : '',
		run.answered !== undefined ? `<div class="mark answer" style="left:${pct(run.answered)}%" title="first click answered ${seconds(run.answered)}"></div>` : '',
	].join('');
	return `<h3>${esc(name)}: the median run's requests</h3><p><small>${run.requests.length} requests, ${seconds(end)} across; green line: first painted frame${run.firstFrame !== undefined ? ` (${seconds(run.firstFrame)})` : ''}, red line: first click answered${run.answered !== undefined ? ` (${seconds(run.answered)})` : ''}</small></p><div class="timeline"><div class="track" style="z-index:1">${marks}</div>${rows}</div>`;
}

/** One self-contained page: a table per browser and network, the pages side by side, and each page's request timeline from its median run. */
export function networkHtml(sides: readonly SideNetwork[], names: readonly string[] = sides.map((s) => s.url)): string {
	const keys = sides[0]?.cells.map((c) => [c.profile, c.browser] as const) ?? [];
	const used = new Set(keys.map(([p]) => p));
	const method = [...used].map((p) => NETWORK_PROFILES[p]).filter((p) => p !== undefined).map((p) => `<li>${esc(p.label)}: ${esc(p.source)}</li>`).join('');
	const sections = keys.map(([profile, browser]) => {
		const cells = sides.map((s) => s.cells.find((c) => c.profile === profile && c.browser === browser)!);
		const title = `${browser}, ${NETWORK_PROFILES[profile]?.label ?? profile}`;
		const skip = cells.find((c) => c.unavailable)?.unavailable;
		if (skip) return `<h2>${esc(title)}: skipped</h2><p>${esc(skip)}</p>`;
		const count = Math.max(...cells.map((c) => c.runs.filter((r) => !r.error).length));
		const rows = RUN_METRICS.filter((m) => cells.some((c) => c.median[m] !== undefined))
			.map((m) => `<tr><td>${esc(RUN_METRIC_LABEL[m])}</td>${cells.map((c) => `<td>${esc(formatValue(m, c.median[m]))}</td>`).join('')}</tr>`)
			.join('');
		const failed = cells.flatMap((c, i) => (c.runs.some((r) => r.error) ? [`<p><small>${esc(names[i]!)}: ${c.runs.filter((r) => r.error).length} of ${c.runs.length} runs failed (${esc(c.runs.find((r) => r.error)!.error!)})</small></p>`] : []));
		const timelines = cells.map((c, i) => (c.medianRun ? timeline(c.medianRun, names[i]!) : '')).join('');
		return `<h2>${esc(title)}: median of ${count} cold loads</h2><table><thead><tr><th>Metric</th>${names.map((n) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${failed.join('')}${timelines}`;
	});
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Slow-network cold loads</title><style>${STYLE}</style></head><body><h1>Slow-network cold loads</h1><p>${names.map((n, i) => `<a href="${esc(sides[i]!.url)}">${esc(n)}</a>`).join(', ')}. Each page loaded cold in a fresh browser through a local proxy: every byte crosses one link with the profile's bandwidth (shared by all connections) and its round-trip time on every packet, so connection set-up, TLS and each request pay what they would on that network, in every browser alike. A control is clicked every ${CLICK_EVERY_MS} ms from when it shows until it answers; the first painted frame is read from screenshots taken every 100 ms.</p><ul>${method}</ul>${sections.join('')}</body></html>\n`;
}
