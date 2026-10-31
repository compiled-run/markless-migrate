// Preloaded into the old site's build and server (NODE_OPTIONS=--import): each off-site request old-fixtures.json holds is
// answered from it, captured once, so every build of the original renders the same third-party data (the header's GitHub
// star count) whatever the API answers that day or its rate limit allows.
import { readFileSync } from 'node:fs';

const fixtures = JSON.parse(readFileSync(new URL('./old-fixtures.json', import.meta.url), 'utf8'));
const live = globalThis.fetch;
const told = new Set();
globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const fixture = fixtures[url.replace(/[?#].*$/, '')];
	if (fixture && !told.has(url) && told.add(url)) process.stderr.write(`old-fixtures: ${url} answered from old-fixtures.json\n`);
	if (fixture) return new Response(JSON.stringify(fixture.body), { status: fixture.status, headers: { 'content-type': 'application/json' } });
	if (/^https?:/.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) process.stderr.write(`old-fixtures: live off-site request, not in old-fixtures.json: ${url}\n`);
	return live(input, init);
};
