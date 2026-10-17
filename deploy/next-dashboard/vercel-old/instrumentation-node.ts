import { startEmbeddedPostgres } from './embedded-postgres/index.mjs';
import seedSql from './embedded-postgres/seed-dashboard.mjs';

process.env.POSTGRES_URL = await startEmbeddedPostgres({ seedSql });
