import { createClient } from 'contentful';

export const contentful = createClient({ space: process.env.CONTENTFUL_SPACE!, accessToken: process.env.CONTENTFUL_TOKEN! });
