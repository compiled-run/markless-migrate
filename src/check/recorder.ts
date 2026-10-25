import { fileURLToPath } from 'node:url';

/** The module a Node server loads with `--require` so its requests are recorded and recorded data can be replayed. */
export const RECORDER = new URL('./record-server.cjs', import.meta.url);

// --require, not --import: Node before 20.6 refuses --import in NODE_OPTIONS, and an old app is often on Node 16.
export function recorderEnv(existing = process.env.NODE_OPTIONS ?? ''): { NODE_OPTIONS: string } {
	return { NODE_OPTIONS: `${existing} --require=${JSON.stringify(fileURLToPath(RECORDER))}`.trim() };
}
