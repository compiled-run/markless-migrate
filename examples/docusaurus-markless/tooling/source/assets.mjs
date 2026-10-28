// Asset URLs by the old build's own rule: small images inline as data URLs, the rest copied as
// /assets/<images|files|fonts|medias>/<name>-<xxhash64 of the content, 16 hex>.<ext>.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { siteRequire } from './site.mjs';

const webpackRequire = createRequire(siteRequire.resolve('webpack/package.json'));
const createHash = webpackRequire('webpack/lib/util/createHash');
const INLINE_MAX = 10000;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/vnd.microsoft.icon', '.avif': 'image/avif' };

// Files the pages use, keyed by their public URL, for import.mjs to copy into public/.
export const emitted = new Map();

export function contentHash(buffer) {
	const hash = createHash('xxhash64');
	hash.update(buffer);
	return hash.digest('hex').slice(0, 16);
}

export function assetUrl(path, request = '') {
	const type = /docusaurus-asset=(image-file|image|file)/.exec(request)?.[1];
	const ext = extname(path).toLowerCase();
	const buffer = readFileSync(path);
	const isImage = /^\.(ico|jpe?g|png|gif|webp|avif|svg)$/.test(ext);
	const folder = type === 'file' ? 'files' : type ? 'images' : isImage ? 'images' : /^\.(woff2?|eot|ttf|otf)$/.test(ext) ? 'fonts' : /^\.(mp4|webm|mov|mp3|wav)$/.test(ext) ? 'medias' : 'files';
	const inline = (type === 'image' || (!type && (isImage || folder === 'fonts' || folder === 'medias'))) && buffer.length <= INLINE_MAX;
	if (inline) return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${buffer.toString('base64')}`;
	const url = `/assets/${folder}/${basename(path, extname(path))}-${contentHash(buffer)}${extname(path)}`;
	emitted.set(url, path);
	return url;
}

void join;
