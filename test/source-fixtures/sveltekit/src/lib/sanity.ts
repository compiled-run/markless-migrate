import { createClient } from '@sanity/client';

export const client = createClient({ projectId: 'demo', dataset: 'production', useCdn: true });
