// Each converted page's root delegates to a registry of only the ports its own markup, the regions it shares with other
// pages and its layers can use: a port another page's markup needs is never in its first click's code.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { convert } from '../src/convert/index.ts';
import { PORTS } from '../src/convert/parts.ts';
import type { PartResolver, PartUsage } from '../src/convert/usage.ts';

// Ports whose markup is one element the resolver names by its data-slot.
const MARKUP: Readonly<Record<string, { readonly slot: string; readonly library: string; readonly export: string; readonly html: (text: string) => string }>> = {
	carousel: { slot: 'carousel', library: 'embla-carousel-react', export: 'default', html: (t) => `<div data-slot="carousel" role="region"><p>${t}</p></div>` },
	resizable: { slot: 'resizable-panel-group', library: 'react-resizable-panels', export: 'Group', html: (t) => `<div data-slot="resizable-panel-group" data-group=""><p>${t}</p></div>` },
	'shadcn/questionnaire': { slot: 'questionnaire', library: '@shadcn/react', export: 'Questionnaire.Root', html: (t) => `<div data-slot="questionnaire"><p>${t}</p></div>` },
	cmdk: { slot: 'command', library: 'cmdk', export: 'Command', html: (t) => `<div data-slot="command" cmdk-root=""><input cmdk-input="" aria-label="${t}"></div>` },
};
const MODULES = Object.keys(MARKUP);

const resolver: PartResolver = {
	name: 'test slots',
	candidates: (slot) => Object.values(MARKUP).filter((m) => m.slot === slot).map((m): PartUsage => ({ library: m.library, export: m.export, file: 'components/ui.tsx', line: 1 })),
	libraries: () => new Map(Object.values(MARKUP).map((m) => [m.library, 1])),
	prop: () => undefined,
};

function random(seed: number): () => number {
	let s = seed;
	return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

interface Shape {
	readonly pages: ReadonlyMap<string, { readonly own: readonly string[]; readonly shares: boolean }>;
	readonly shared: string;
}

// Pages with their own ports, two of them sharing a region large enough to be one component, which holds another port.
function shape(seed: number): Shape {
	const rnd = random(seed);
	const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]!;
	const words = ['alpha', 'harbor', 'quill', 'meadow', 'cobalt', 'ember', 'lattice', 'summit'];
	const count = 3 + Math.floor(rnd() * 3);
	const shared = pick(MODULES);
	const pages = new Map<string, { own: string[]; shares: boolean }>();
	while (pages.size < count) {
		const path = `/${pick(words)}${pages.size ? `/${pick(words)}-${pages.size}` : ''}`;
		if (pages.has(path)) continue;
		const own = MODULES.filter(() => rnd() < 0.4);
		pages.set(path, { own, shares: pages.size < 2 });
	}
	return { pages, shared };
}

function html(s: Shape, path: string): string {
	const page = s.pages.get(path)!;
	const region = `<section class="shared">${'<p>The same long region on two pages, factored into one component they both render.</p>'.repeat(30)}${MARKUP[s.shared]!.html('shared')}</section>`;
	const own = page.own.map((m) => MARKUP[m]!.html(`${path} ${m}`)).join('');
	return `<!doctype html><html lang="en"><head><title>${path}</title></head><body><main><h1>${path}</h1>${own}${page.shares ? region : ''}</main></body></html>`;
}

let server: Server;
let origin: string;
let current: Shape;
before(async () => {
	server = createServer((req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		const found = current.pages.has(path);
		res.writeHead(found ? 200 : 404, { 'content-type': 'text/html' }).end(found ? html(current, path) : '<!doctype html><title>Not found</title><body><main><h1>Not found</h1></main></body>');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

// The ports a module the page imports its runtime from loads, through the registry it imports if it is not one.
async function portsOf(file: string): Promise<string[]> {
	const text = await readFile(file, 'utf8');
	const via = /^import \{ PARTS \} from '(.+)';$/m.exec(text)?.[1];
	if (via) return portsOf(join(dirname(file), via));
	return [...text.matchAll(/^import \* as \w+ from '\.\.?\/(.+)\.ts';$/gm)].map((m) => m[1]!).sort();
}

for (const seed of [7, 1234, 98765]) {
	test(`each page's root delegates to a registry of its own ports and its shared regions' (pages shaped by seed ${seed})`, async () => {
		current = shape(seed);
		const app = await mkdtemp(join(tmpdir(), 'page-parts-'));
		try {
			await mkdir(join(app, '.migrate'), { recursive: true });
			await writeFile(join(app, '.migrate', 'inventory.json'), JSON.stringify({ origin, routes: [...current.pages.keys()].map((route) => ({ route, status: 200 })) }));
			await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'page-parts', private: true, type: 'module', dependencies: {} }));
			await writeFile(join(app, '.migrate', 'libraries.json'), JSON.stringify({ libraries: [] }));
			const report = await convert({ old: origin, app, reveal: false, resolver });
			assert.ok(report.shared.length > 0, 'the region two pages render is one shared component');
			const usedAnywhere = new Set([...current.pages.values()].flatMap((p) => [...p.own, ...(p.shares ? [current.shared] : [])]));
			for (const r of report.routes.filter((x) => current.pages.has(x.route))) {
				const page = current.pages.get(r.route)!;
				const expected = [...new Set([...page.own, ...(page.shares ? [current.shared] : [])])].sort();
				const source = await readFile(join(app, r.page), 'utf8');
				const imported = /^import \{ (?:behave, )?listen \} from '(.+)';$/m.exec(source)?.[1];
				assert.ok(imported, `${r.route} imports the parts runtime`);
				const loaded = await portsOf(join(dirname(join(app, r.page)), imported));
				assert.deepEqual(loaded, expected, `${r.route}: its registry holds only the ports its markup uses`);
				assert.deepEqual(r.ports, loaded, `${r.route}: the report names the ports its page loads, for the routes a port's change can break`);
				for (const other of usedAnywhere) if (!expected.includes(other)) assert.ok(!loaded.includes(other), `${r.route} does not load ${other}, which only other pages use`);
				const events = new Set(PORTS.filter((p) => expected.includes(p.module)).flatMap((p) => p.events));
				const handlers = [...source.matchAll(/ on(\w+)=\{\(event\) => behave\(event\)\}/g)].map((m) => m[1]!.toLowerCase()).sort();
				assert.deepEqual(handlers, [...events].sort(), `${r.route}: its root listens only to the events its ports take`);
			}
		} finally {
			await rm(app, { recursive: true, force: true });
		}
	});
}
