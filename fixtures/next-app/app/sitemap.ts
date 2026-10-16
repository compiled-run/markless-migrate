import type { MetadataRoute } from 'next';
import { locales } from './dictionaries';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
	return locales.flatMap((lang) => ['', '/about', '/contact'].map((path) => ({ url: `https://harbour.example/${lang}${path}`, lastModified: new Date() })));
}
