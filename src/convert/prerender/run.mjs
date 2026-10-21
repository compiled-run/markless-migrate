// Run in the old app's directory (its files are what the handlers read from process.cwd()): imports each ported handler
// module and calls it once per path, as Next.js's build does for a static route, writing every response to the output file.
import { register } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [jobsFile, outFile] = process.argv.slice(2);
const { oldApp, origin, env, jobs } = JSON.parse(readFileSync(jobsFile, 'utf8'));
Object.assign(process.env, env);
register(new URL('./hooks.mjs', import.meta.url), { data: { oldApp } });

const results = [];
for (const job of jobs) {
	let mod;
	try {
		mod = await import(pathToFileURL(job.module).href);
	} catch (error) {
		for (const p of job.paths) results.push({ path: p.path, error: `import: ${error?.stack ?? error}` });
		continue;
	}
	for (const p of job.paths) {
		try {
			if (job.kind === 'metadata') {
				const value = await mod.default();
				results.push({ path: p.path, value: JSON.parse(JSON.stringify(value)) });
				continue;
			}
			const request = new Request(new URL(p.path, origin));
			const response = await mod.GET(Object.assign(request, { nextUrl: new URL(request.url) }), { params: Promise.resolve(p.params ?? {}) });
			results.push({ path: p.path, status: response.status, headers: [...response.headers], body: Buffer.from(await response.arrayBuffer()).toString('base64') });
		} catch (error) {
			results.push({ path: p.path, error: String(error?.stack ?? error) });
		}
	}
}
writeFileSync(outFile, JSON.stringify(results));
process.exit(0);
