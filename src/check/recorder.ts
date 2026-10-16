/** The module a Node server loads with `--import` so its requests are recorded and recorded data can be replayed. */
export const RECORDER = new URL('./record-server.mjs', import.meta.url);

export function recorderEnv(existing = process.env.NODE_OPTIONS ?? ''): { NODE_OPTIONS: string } {
	return { NODE_OPTIONS: `${existing} --import=${RECORDER.href}`.trim() };
}
