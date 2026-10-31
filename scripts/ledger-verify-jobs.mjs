// The ledger's unanswered handlers as browser jobs for ledger-verify.mjs: each port element, the route it was tried on, and the
// trigger that opens its layer. node scripts/ledger-verify-jobs.mjs <app>/.migrate/ledger.json <app> <jobs.json>
import { readPort, renderRoute, pageOf } from '../src/ledger/port.ts';
import { Window } from 'happy-dom';
import { readFileSync, writeFileSync } from 'node:fs';
const [ledgerFile, app, out] = process.argv.slice(2);
const l = JSON.parse(readFileSync(ledgerFile, 'utf8'));
const port = await readPort(app);
const locOf = (el) => ({ tag: el.tag, slot: el.attrs['data-slot'], label: el.attrs['aria-label'], placeholder: el.attrs.placeholder, role: el.attrs.role, id: el.attrs.id && !/[{}]/.test(el.attrs.id) && !/^(mm-|radix-|base-ui-|react-aria)/.test(el.attrs.id) ? el.attrs.id : undefined, text: el.text.slice(0, 80) });
const pages = pageOf(port);
const rendered = new Map();
const docOf = (route) => {
  if (!rendered.has(route)) { const w = new Window({ url: 'http://localhost/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true } }); w.document.body.innerHTML = renderRoute(port, pages.get(route) ?? pages.get(route.split('?')[0]), route) + renderRoute(port, 'document.tsrx', route); rendered.set(route, w.document); }
  return rendered.get(route);
};
// The element's position among those the locator finds, in the port's page: the same position is taken on both sides.
const nthOf = (route, ref, loc) => {
  const doc = docOf(route);
  let sel = loc.tag ?? '*';
  if (loc.slot) sel += `[data-slot="${loc.slot}"]`;
  if (loc.label) sel += `[aria-label="${loc.label.replace(/"/g, '\\"')}"]`;
  if (loc.placeholder) sel += `[placeholder="${loc.placeholder.replace(/"/g, '\\"')}"]`;
  if (loc.role) sel += `[role="${loc.role}"]`;
  const squash = (s) => (s ?? '').replace(/\s+/g, '');
  const hits = [...doc.querySelectorAll(sel)].filter((el) => !loc.text || squash(el.textContent).includes(loc.text.slice(0, 60)));
  return hits.findIndex((el) => el.getAttribute('data-mm-ledger') === ref);
};
const jobs = new Map();
for (const e of l.entries) {
  if (e.verdict !== 'unmapped') continue;
  const [f, i] = e.port.split('#');
  const pf = port.get(f); const el = pf?.elements.find((x) => x.index === +i);
  if (!el) continue;
  let trigger;
  if (el.layer) {
    // the trigger: an element anywhere whose aria-controls or id is the layer key
    for (const p of port.values()) { const t = p.elements.find((x) => x.attrs['aria-controls'] === el.layer || (x.attrs.id === el.layer && x.tag !== 'div')); if (t) { trigger = locOf(t); break; } }
  }
  const key = `${e.route} ${e.port}`;
  const target = locOf(el);
  try { target.nth = nthOf(e.route, e.port, target); } catch { target.nth = -1; }
  const job = jobs.get(key) ?? { route: e.route, port: e.port, event: e.event, target, ...(el.layer ? { layer: el.layer, trigger } : {}), sites: [] };
  job.sites.push(`${e.site.file}:${e.site.line}`);
  jobs.set(key, job);
}
writeFileSync(out, JSON.stringify([...jobs.values()], null, 1));
console.log(jobs.size, 'jobs;', [...jobs.values()].filter((j) => j.layer).length, 'in layers;', [...jobs.values()].filter((j) => j.layer && !j.trigger).length, 'layers without trigger');
