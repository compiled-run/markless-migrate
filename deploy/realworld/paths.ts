import { join } from 'node:path';

// Upstream checkouts live outside this repo (their commits are recorded in examples/realworld-markless-LOG.md).
export const UPSTREAMS = process.env.MM_UPSTREAMS ?? join(import.meta.dirname, '../../../mm-upstreams');
export const API_DIR = join(UPSTREAMS, 'nitro-prisma-zod-realworld-example-app');
