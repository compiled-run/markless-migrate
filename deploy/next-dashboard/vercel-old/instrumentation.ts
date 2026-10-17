// Deploy-only (added to the build copy, not the app): starts the seeded in-function Postgres before any route loads.
export async function register() {
	if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.EMBEDDED_POSTGRES === '1') await import('./instrumentation-node');
}
