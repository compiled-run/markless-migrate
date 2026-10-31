// The plan command apart from the CLI, so the pipeline's plan key (scripts/pipeline.ts) reads this module's imports, not every command's.
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readAuthFile } from '../check/auth.ts';
import { bypassOptions } from '../check/blocked.ts';
import { PSI_NOTICE, psiKey } from '../check/psi.ts';
import { planAndWrite } from '../cache/cli.ts';
import { planLibraries } from '../library/index.ts';
import { STATE_DIR } from '../status.ts';
import { planUsage } from '../usage/index.ts';
import { writeStarterAuth } from './auth.ts';
import { plan, summarizeInventory, writeInventory } from './inventory.ts';
import { readSamples } from './routes.ts';

export async function planCommand(rest: string[], cwd: string, out: (text: string) => void, fail: (message: string) => never): Promise<number> {
		const { values } = parseArgs({ args: rest, options: { old: { type: 'string' }, source: { type: 'string' }, built: { type: 'string' }, limit: { type: 'string' }, 'crawl-limit': { type: 'string' }, header: { type: 'string', multiple: true }, cookie: { type: 'string', multiple: true }, 'user-agent': { type: 'string' }, auth: { type: 'string' }, 'no-caching': { type: 'boolean' } } });
		if (!values.old) fail('plan needs --old <origin>');
		const crawlBound = values['crawl-limit'] === undefined ? undefined : Number(values['crawl-limit']);
		if (crawlBound !== undefined && (!Number.isInteger(crawlBound) || crawlBound < 1)) fail('--crawl-limit must be a whole number of at least 1');
		let bypass: ReturnType<typeof bypassOptions> = {};
		try {
			bypass = bypassOptions(values.header, values.cookie);
		} catch (error) {
			fail((error as Error).message);
		}
		const planAuth = values.auth ? await readAuthFile(values.auth).catch((error: Error) => fail(error.message)) : undefined;
		const inventory = await plan({ origin: values.old, source: values.source ? resolve(values.source) : undefined, limit: values.limit ? Number(values.limit) : undefined, ...(crawlBound ? { crawlBound } : {}), ...bypass, ...(values['user-agent'] ? { userAgent: values['user-agent'] } : {}), ...(planAuth ? { auth: planAuth } : {}), samples: await readSamples(join(cwd, STATE_DIR)) });
		const path = await writeInventory(inventory, join(cwd, STATE_DIR));
		out(`${summarizeInventory(inventory)}Wrote ${path}\n`);
		if (!values['no-caching']) {
			const caching = await planAndWrite(cwd, inventory, { headers: bypass.headers ?? {} });
			out(`${caching.text}Wrote ${caching.path}\n`);
		}
		let libraries: Awaited<ReturnType<typeof planLibraries>> | undefined;
		if (inventory.source) {
			libraries = await planLibraries(inventory.source, join(cwd, STATE_DIR), cwd);
			out(`${libraries.text}Wrote ${libraries.path}\n`);
		}
		const usage = await planUsage({ inventory, stateDir: join(cwd, STATE_DIR), newSource: cwd, ...(values.built ? { built: resolve(values.built) } : {}), ...(libraries ? { libraries: libraries.file } : {}), ...(bypass.headers ? { headers: bypass.headers } : {}) });
		out(`${usage.text}Wrote ${usage.paths.usage} and ${usage.paths.obligations}\n`);
		const authPath = join(cwd, STATE_DIR, 'auth.json');
		if (inventory.auth) out((await writeStarterAuth(authPath, inventory.auth)) ? `Wrote ${authPath}: set the credentials it names in the environment, check its login steps, then pass --auth ${authPath} to check.\n` : `Kept ${authPath} (already there); roles found: ${Object.keys(inventory.auth.roles).join(', ')}.\n`);
		if (!psiKey()) out(`\n${PSI_NOTICE}\n`);
		return 0;
}
