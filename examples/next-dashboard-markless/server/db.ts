import postgres from 'postgres';

// The demo deployment has no hosted Postgres: EMBEDDED_POSTGRES=1 starts a seeded one inside the function.
async function connection(): Promise<string> {
	if (process.env.EMBEDDED_POSTGRES !== '1') return process.env.POSTGRES_URL!;
	const { startEmbeddedPostgres } = await import('./embedded/index.mjs');
	const { default: seedSql } = await import('./embedded/seed-dashboard.mjs');
	return startEmbeddedPostgres({ seedSql });
}

// Nitro bundles middleware, endpoints and the page renderer separately; one pool for all of them.
const store = globalThis as { __dashboardSql?: Promise<ReturnType<typeof postgres>> };
export const sql = await (store.__dashboardSql ??= connection().then((url) => postgres(url, { ssl: 'require' })));
