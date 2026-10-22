import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeEntities, parseHtml } from '../usage/html.ts';
import { providerById } from './providers.ts';
import type { EmbedUse } from './types.ts';

/** What an embed shows, read at convert time from its provider's oEmbed endpoint or official API. */
export interface EmbedData {
	readonly fetchedAt: string;
	/** Every address read for it, so the source of each field can be checked. */
	readonly sources: readonly string[];
	readonly fields: Readonly<Record<string, unknown>>;
	readonly errors?: readonly string[];
}

export interface DataOptions {
	readonly cacheDir: string;
	/** An answer younger than this is reused without asking again (default one day). */
	readonly maxAgeMs?: number;
	readonly refresh?: boolean;
	readonly fetch?: typeof fetch;
	readonly env?: NodeJS.ProcessEnv;
}

const DAY = 24 * 60 * 60 * 1000;
const AGENT = 'markless-migrate (+https://github.com/thejackshelton/markless-migrate)';

type Getter = (url: string, headers?: Record<string, string>) => Promise<unknown>;

/** robots.txt of each origin, read once: a page is fetched for its Open Graph tags only where it allows. */
const robots = new Map<string, Promise<string>>();
export async function robotsAllow(url: string, get: typeof fetch): Promise<boolean> {
	const u = new URL(url);
	if (!robots.has(u.origin)) robots.set(u.origin, get(`${u.origin}/robots.txt`, { headers: { 'user-agent': AGENT } }).then((r) => (r.ok ? r.text() : '')).catch(() => ''));
	return robotsTxtAllows(await robots.get(u.origin)!, u.pathname + u.search);
}

/** Whether robots.txt lets any user agent fetch the path: the longest matching rule of the `*` group wins, Allow on a tie. */
export function robotsTxtAllows(text: string, path: string): boolean {
	let inStar = false;
	let groupStarted = false;
	const rules: { allow: boolean; pattern: string }[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.replace(/#.*/, '').trim();
		const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
		if (!m) continue;
		const [field, value] = [m[1]!.toLowerCase(), m[2]!.trim()];
		if (field === 'user-agent') {
			if (groupStarted) inStar = false;
			groupStarted = false;
			inStar ||= value === '*';
		} else if (field === 'allow' || field === 'disallow') {
			groupStarted = true;
			if (inStar && value) rules.push({ allow: field === 'allow', pattern: value });
		}
	}
	const matches = (pattern: string) => new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$')}`).test(path);
	const hit = rules.filter((r) => matches(r.pattern)).sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow))[0];
	return hit ? hit.allow : true;
}

/** The Open Graph and oEmbed discovery tags of a page, where robots.txt allows reading it. */
export async function pageMeta(url: string, get: typeof fetch): Promise<Record<string, string> | undefined> {
	if (!(await robotsAllow(url, get))) return undefined;
	const response = await get(url, { headers: { 'user-agent': AGENT, accept: 'text/html' } });
	if (!response.ok || !/html/.test(response.headers.get('content-type') ?? '')) return undefined;
	const meta: Record<string, string> = {};
	for (const el of parseHtml(await response.text())) {
		const name = el.attrs.get('property') ?? el.attrs.get('name');
		if (el.tag === 'meta' && name && el.attrs.has('content') && /^(og|twitter|description$)/.test(name)) meta[name] ??= decodeEntities(el.attrs.get('content')!);
		if (el.tag === 'link' && el.attrs.get('type') === 'application/json+oembed' && el.attrs.get('href')) meta['oembed'] ??= new URL(el.attrs.get('href')!, url).href;
		if (el.tag === 'title' && el.text) meta['title'] ??= decodeEntities(el.text.trim());
		if (el.tag === 'video' && el.attrs.get('poster')) meta['video:poster'] ??= new URL(el.attrs.get('poster')!, url).href;
	}
	return meta;
}

const atUriToUrl = (uri: string) => {
	const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
	return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : uri;
};

/** The fields one provider gives for one embed, and every address read. */
async function providerFields(use: EmbedUse, getJson: Getter, get: typeof fetch, env: NodeJS.ProcessEnv): Promise<{ fields: Record<string, unknown>; sources: string[] }> {
	const sources: string[] = [];
	const json = async (url: string, headers?: Record<string, string>) => {
		sources.push(url);
		return getJson(url, headers);
	};
	const oembed = async (template: string, url: string) => (await json(template.replace('{url}', encodeURIComponent(url)))) as Record<string, unknown>;
	const github = env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : undefined;
	switch (use.provider) {
		case 'youtube': {
			const watch = `https://www.youtube.com/watch?v=${use.key}`;
			const o = await oembed(providerById('youtube')!.data!, watch);
			const fields: Record<string, unknown> = { id: use.key, watch, title: o.title, author: o.author_name, authorUrl: o.author_url, thumbnail: o.thumbnail_url, width: o.width, height: o.height };
			const maxres = `https://i.ytimg.com/vi/${use.key}/maxresdefault.jpg`;
			sources.push(maxres);
			if ((await get(maxres, { method: 'HEAD' }).catch(() => undefined))?.ok) fields.poster = maxres;
			if (env.YOUTUBE_API_KEY) {
				const video = (await json(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${use.key}&key=${env.YOUTUBE_API_KEY}`)) as { items?: { snippet?: { channelId?: string }; contentDetails?: { duration?: string } }[] };
				const channelId = video.items?.[0]?.snippet?.channelId;
				fields.duration = video.items?.[0]?.contentDetails?.duration;
				if (channelId) {
					const channel = (await json(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${env.YOUTUBE_API_KEY}`)) as { items?: { snippet?: { thumbnails?: Record<string, { url: string }> } }[] };
					fields.avatar = channel.items?.[0]?.snippet?.thumbnails?.default?.url;
				}
			} else if (typeof o.author_url === 'string') {
				sources.push(o.author_url);
				const meta = await pageMeta(o.author_url, get).catch(() => undefined);
				if (meta?.['og:image']) fields.avatar = meta['og:image'];
			}
			return { fields, sources };
		}
		case 'vimeo': {
			const o = await oembed(providerById('vimeo')!.data!, use.url ?? `https://vimeo.com/${use.key}`);
			return { fields: { id: use.key, title: o.title, author: o.author_name, authorUrl: o.author_url, thumbnail: o.thumbnail_url, width: o.width, height: o.height, duration: o.duration }, sources };
		}
		case 'twitter': {
			const o = await oembed(providerById('twitter')!.data!, use.url ?? '');
			return { fields: { id: use.key, url: o.url, author: o.author_name, authorUrl: o.author_url, html: o.html }, sources };
		}
		case 'bluesky': {
			const uri = use.key.startsWith('at://') ? use.key : '';
			const o = await oembed(providerById('bluesky')!.data!, atUriToUrl(use.key));
			const posts = uri ? ((await json(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`)) as { posts?: unknown[] }) : {};
			return { fields: { uri, url: atUriToUrl(use.key), author: o.author_name, authorUrl: o.author_url, html: o.html, post: posts.posts?.[0] }, sources };
		}
		case 'mastodon': {
			const url = new URL(use.url ?? use.attributes['data-embed-url'] ?? use.key);
			const id = /(\d+)(?:\/embed)?\/?$/.exec(url.pathname)?.[1];
			return { fields: { url: url.href, status: await json(`${url.origin}/api/v1/statuses/${id}`) }, sources };
		}
		case 'ghbtns':
		case 'github-button': {
			const [owner, repo] = new URL(use.url ?? 'https://github.com/').pathname.slice(1).split('/');
			const api = repo ? `https://api.github.com/repos/${owner}/${repo}` : `https://api.github.com/users/${owner}`;
			const r = (await json(api, github)) as Record<string, unknown>;
			return { fields: { owner, repo, stars: r.stargazers_count, forks: r.forks_count, watchers: r.subscribers_count, followers: r.followers, htmlUrl: r.html_url }, sources };
		}
		case 'gist': {
			const g = (await json(`https://api.github.com/gists/${use.key}`, github)) as { description?: string; owner?: { login?: string }; html_url?: string; files?: Record<string, { filename: string; language?: string; raw_url?: string; content?: string }> };
			return { fields: { id: use.key, description: g.description, owner: g.owner?.login, url: g.html_url, files: Object.values(g.files ?? {}).map((f) => ({ name: f.filename, language: f.language, raw: f.raw_url, content: f.content })) }, sources };
		}
		case 'link-card': {
			const target = decodeURIComponent(use.url ?? use.key);
			sources.push(target);
			return { fields: { url: target, meta: await pageMeta(target, get) }, sources };
		}
		default: {
			// A provider with no adapter: its oEmbed endpoint when it has one, else what the frame's own page says about itself.
			const provider = providerById(use.provider);
			if (provider?.data && use.url) return { fields: { oembed: await oembed(provider.data, use.url) }, sources };
			if (!use.url) return { fields: {}, sources };
			sources.push(use.url);
			const meta = await pageMeta(use.url, get).catch(() => undefined);
			const discovered = meta?.oembed ? await json(meta.oembed).catch(() => undefined) : undefined;
			return { fields: { meta, ...(discovered ? { oembed: discovered } : {}) }, sources };
		}
	}
}

const cacheKey = (use: Pick<EmbedUse, 'id' | 'provider' | 'key' | 'url'>) => createHash('sha256').update(JSON.stringify([use.provider, use.key, use.url])).digest('hex').slice(0, 12);

/**
 * The data an embed shows, from its provider at convert time, cached under `cacheDir/<embed id>/data.json`. A cached
 * answer younger than `maxAgeMs` is reused; a failed fetch falls back to the last answer and records why.
 */
export async function embedData(use: EmbedUse, options: DataOptions): Promise<EmbedData> {
	const dir = join(options.cacheDir, use.id);
	const path = join(dir, 'data.json');
	const cached = await readFile(path, 'utf8').then((t) => JSON.parse(t) as EmbedData & { key?: string }).catch(() => undefined);
	const key = cacheKey(use);
	if (cached && cached.key === key && !options.refresh && Date.now() - Date.parse(cached.fetchedAt) < (options.maxAgeMs ?? DAY) && !cached.errors?.length) return cached;
	const get = options.fetch ?? fetch;
	const getJson: Getter = async (url, headers) => {
		const response = await get(url, { headers: { 'user-agent': AGENT, accept: 'application/json', ...headers } });
		if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
		return response.json();
	};
	let data: EmbedData;
	try {
		const { fields, sources } = await providerFields(use, getJson, get, options.env ?? process.env);
		data = { fetchedAt: new Date().toISOString(), sources, fields };
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		if (cached) return { ...cached, errors: [...(cached.errors ?? []), `${new Date().toISOString()}: ${why}; kept the answer from ${cached.fetchedAt}`] };
		data = { fetchedAt: new Date().toISOString(), sources: [], fields: {}, errors: [why] };
	}
	await mkdir(dir, { recursive: true });
	await writeFile(path, `${JSON.stringify({ key, ...data }, null, '\t')}\n`);
	return data;
}
