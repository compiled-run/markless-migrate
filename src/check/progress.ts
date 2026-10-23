import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RouteResult } from './types.ts';

export const PROGRESS_DIR = 'check-progress';

const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * Each route's result of a check run, written as the route finishes, so a run that stops (a crash, a reboot, a killed
 * job) is resumed where it was: `--resume` takes a route's written result instead of checking it again. A run is the
 * same run when the origins and the options that change a result are; any other run starts its own directory.
 */
export class CheckProgress {
	readonly #dir: string;
	readonly #resume: boolean;
	#ready: Promise<void> | undefined;

	constructor(root: string, identity: unknown, resume: boolean) {
		this.#dir = join(root, PROGRESS_DIR, sha(JSON.stringify(identity)));
		this.#resume = resume;
	}

	get dir(): string {
		return this.#dir;
	}

	#prepare(): Promise<void> {
		this.#ready ??= (this.#resume ? Promise.resolve() : rm(this.#dir, { recursive: true, force: true })).then(() => mkdir(this.#dir, { recursive: true }).then(() => {}));
		return this.#ready;
	}

	#file(route: string, role: string | undefined): string {
		return join(this.#dir, `${sha(`${role ?? ''} ${route}`)}.json`);
	}

	/** The result an earlier run of the same check wrote for the route, when resuming. */
	async done(route: string, role: string | undefined): Promise<RouteResult | undefined> {
		await this.#prepare();
		if (!this.#resume) return undefined;
		const text = await readFile(this.#file(route, role), 'utf8').catch(() => undefined);
		if (!text) return undefined;
		try {
			const saved = JSON.parse(text) as { route: string; role?: string; result: RouteResult };
			return saved.route === route && (saved.role ?? undefined) === role ? saved.result : undefined;
		} catch {
			return undefined;
		}
	}

	async write(route: string, role: string | undefined, result: RouteResult): Promise<void> {
		await this.#prepare();
		const file = this.#file(route, role);
		await writeFile(`${file}.tmp`, JSON.stringify({ route, ...(role ? { role } : {}), result }));
		await rename(`${file}.tmp`, file);
	}
}
