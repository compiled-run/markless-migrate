// node --expose-gc test/memory-run.ts <routes> [dir]: checks synthetic routes (screenshots into dir when given) and prints what the run held after a full GC early and late in it, and what the finished report holds.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runCheck } from '../src/check/run.ts';

const CONCURRENCY = 4;
const [count, dir] = [Number(process.argv[2]), process.argv[3]];
const rows = Array.from({ length: 400 }, (_, i) => `<p class="r${i % 5}">Row ${i}: <span>value ${i * 7}</span> <em>note ${i % 13}</em></p>`).join('');
const page = (path: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${path}</title><style>p{margin:2px 0;color:#333}.r1{color:#a00}.r2{background:#eef}em{font-size:12px}</style></head><body><main><h1>${path}</h1>${rows}</main></body></html>`;
const app = (): Promise<Server> =>
	new Promise((done) => {
		const server = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page(new URL(req.url ?? '/', 'http://x').pathname)));
		server.listen(0, '127.0.0.1', () => done(server));
	});
const origin = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

function buffers(value: unknown, seen = new Set<unknown>()): number {
	if (Buffer.isBuffer(value)) return 1;
	if (!value || typeof value !== 'object' || seen.has(value)) return 0;
	seen.add(value);
	return Object.values(value).reduce((n: number, v) => n + buffers(v, seen), 0);
}

const gc = (globalThis as { gc?: () => void }).gc!;
const held = () => {
	gc();
	const m = process.memoryUsage();
	return m.heapUsed + m.arrayBuffers;
};

const [old, next] = await Promise.all([app(), app()]);
try {
	const routes = Array.from({ length: count }, (_, i) => `/page-${i}`);
	// Both marks are taken with the pool still full, so the routes in flight weigh the same in each.
	const marks = { early: CONCURRENCY, late: count - CONCURRENCY };
	const at: Record<string, number> = {};
	let done = 0;
	const report = await runCheck({
		oldOrigin: origin(old),
		newOrigin: origin(next),
		routes,
		concurrency: CONCURRENCY,
		templates: false,
		...(dir ? { artifactsDir: dir } : {}),
		onRoute: () => {
			done++;
			for (const [name, n] of Object.entries(marks)) if (done === n) at[name] = held();
		},
	});
	const end = held();
	process.stdout.write(`${JSON.stringify({ routes: report.routes.length, checked: report.routes.filter((r) => !r.infrastructure).length, shots: report.routes.reduce((n, r) => n + r.shots.length, 0), buffers: buffers(report), between: marks.late - marks.early, early: at.early, late: at.late, end })}\n`);
} finally {
	old.close();
	next.close();
}
