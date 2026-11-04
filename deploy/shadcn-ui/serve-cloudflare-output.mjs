// Serves a cloudflare-module build (.output/server/wrangler.json and its assets) in local workerd through wrangler's own dev
// pipeline (_headers, _redirects, html_handling, the ASSETS binding), with no account and nothing sent to Cloudflare.
// Prints `serving <url>` once the Worker has answered, and exits non-zero when the runtime cannot start.
import { unstable_startWorker } from 'wrangler';

const [config, port = '3000', host = '127.0.0.1'] = process.argv.slice(2);
if (!config) {
	console.error('usage: serve-cloudflare-output.mjs <.output/server/wrangler.json> [port] [host]');
	process.exit(2);
}
const started = Date.now();

async function start(compatibilityDate) {
	// Watching the assets folder holds one descriptor per file on macOS; past 10,240 open, spawning workerd fails with EBADF.
	const worker = await unstable_startWorker({ config, ...(compatibilityDate && { compatibilityDate }), dev: { watch: false, liveReload: false, inspector: false, server: { hostname: host, port: Number(port) } } });
	const failed = new Promise((_, fail) => worker.raw.on('error', (event) => fail(new Error(String(event?.cause?.message ?? event?.reason ?? event)))));
	try {
		await Promise.race([worker.ready, failed]);
		const url = String(await worker.url);
		const answered = await Promise.race([worker.fetch(url), failed]);
		await answered.arrayBuffer();
		return { worker, url, status: answered.status };
	} catch (error) {
		await worker.dispose().catch(() => {});
		throw error;
	}
}

let served;
try {
	served = await start().catch(async (error) => {
		// Nitro writes the build day as compatibility_date; a local workerd released before that day refuses to start.
		const [, wanted, newest] = /requires compatibility date \\?"([\d-]+)\\?", but the newest date supported by this server binary is \\?"([\d-]+)/.exec(error.message) ?? [];
		if (!newest) throw error;
		console.log(`compatibility_date ${wanted} is newer than this workerd supports: serving with ${newest}`);
		return start(newest);
	});
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
console.log(`serving ${served.url} (${Date.now() - started} ms, / answered ${served.status})`);

const stop = () => served.worker.dispose().finally(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
