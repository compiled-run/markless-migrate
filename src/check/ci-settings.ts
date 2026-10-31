/** What check.yml gives each shard's `check` besides its routes, origins and site targets: `dev --verdict` runs the same. */
export const SHARD_CHECK = { concurrency: 1, timeoutSeconds: 3600, flags: ['--control-webkit', '--busy-cpu'] } as const;

export type ProbeEngine = 'chromium' | 'webkit';

/** The dead-controls probe's budgets per engine in probe-dead-controls.yml. */
export const PROBE_ENGINES: Readonly<Record<ProbeEngine, Readonly<Record<string, string>>>> = {
	chromium: { MAX_ACTIONS: '30', KEY_MAX: '24', INPUT_MAX: '24', CONCURRENCY: '2' },
	webkit: { MAX_ACTIONS: '15', KEY_MAX: '8', INPUT_MAX: '8', CONCURRENCY: '1' },
};

/** `check` arguments of one shard: the workflow's inputs when given, else the defaults above. */
export function shardCheckArgs(concurrency?: string, timeout?: string): string[] {
	return ['--concurrency', concurrency || String(SHARD_CHECK.concurrency), '--timeout', timeout || String(SHARD_CHECK.timeoutSeconds), ...SHARD_CHECK.flags];
}
