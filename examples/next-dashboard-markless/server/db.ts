import postgres from 'postgres';

// Nitro bundles middleware, endpoints and the page renderer separately; one pool for all of them.
const store = globalThis as { __dashboardSql?: ReturnType<typeof postgres> };
export const sql = (store.__dashboardSql ??= postgres(process.env.POSTGRES_URL!, { ssl: 'require' }));
