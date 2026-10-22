import type { Provider, ProviderTerms } from './types.ts';

const has = (attrs: ReadonlyMap<string, string>, name: string) => attrs.has(name);
const classes = (attrs: ReadonlyMap<string, string>) => (attrs.get('class') ?? '').split(/\s+/);
const VISITOR: ProviderTerms = { study: true, note: 'the embed is loaded as a visitor\'s browser loads it; its data comes from the provider\'s oEmbed endpoint or official API' };
const UNKNOWN: ProviderTerms = { study: true, note: 'no terms on record for this provider: the embed is studied as a visitor\'s browser loads it; confirm its terms allow a recreated preview before switching' };

/**
 * Every provider markless-migrate knows, most specific first. A provider with an `adapter` has a pre-built Markless
 * component (src/embed/adapters/); the rest go through the same study, write and check loop per embed. A `keep`
 * provider stays as it is on every page, for the reason given.
 */
export const PROVIDERS: readonly Provider[] = [
	{
		id: 'youtube',
		name: 'YouTube',
		kind: 'player',
		frame: /^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})(?:[?#]|$)/,
		loaders: [/^https?:\/\/(?:www\.)?youtube\.com\/(?:iframe_api|player_api)/],
		markup: (tag, attrs) => {
			if (tag === 'lite-youtube' && attrs.get('videoid')) return { key: attrs.get('videoid')!, form: 'facade' };
			const style = attrs.get('style') ?? '';
			const poster = /(?:i\.ytimg\.com|img\.youtube\.com)\/vi(?:_webp)?\/([\w-]{11})\//.exec(style);
			if (poster && (classes(attrs).includes('yt-lite') || has(attrs, 'data-title'))) return { key: poster[1]!, form: 'facade' };
			return undefined;
		},
		slot: { selector: 'lite-youtube, article.yt-lite, .yt-lite[data-title]' },
		data: 'https://www.youtube.com/oembed?format=json&url={url}',
		adapter: 'youtube',
		terms: { study: true, note: 'YouTube\'s oEmbed endpoint gives the title, channel and thumbnail; the player is loaded unchanged on activation, as lite-youtube-embed does', url: 'https://developers.google.com/youtube/terms/api-services-terms-of-service' },
	},
	{
		id: 'youtube-live',
		name: 'YouTube live stream',
		kind: 'player',
		frame: /^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/live_stream\?channel=([\w-]+)/,
		keep: { reason: 'live-at-load', why: 'a live stream: what it shows changes by the minute' },
		terms: VISITOR,
	},
	{
		id: 'vimeo',
		name: 'Vimeo',
		kind: 'player',
		frame: /^https?:\/\/player\.vimeo\.com\/video\/(\d+)/,
		loaders: [/^https?:\/\/player\.vimeo\.com\/api\/player\.js/],
		markup: (tag, attrs) => (tag === 'lite-vimeo' && (attrs.get('videoid') ?? attrs.get('data-id')) ? { key: (attrs.get('videoid') ?? attrs.get('data-id'))!, form: 'facade' } : undefined),
		slot: { selector: 'lite-vimeo' },
		data: 'https://vimeo.com/api/oembed.json?url={url}',
		adapter: 'vimeo',
		terms: { ...VISITOR, url: 'https://developer.vimeo.com/api/oembed/videos' },
	},
	{
		id: 'twitter',
		name: 'X (Twitter) post',
		kind: 'post',
		frame: /^https?:\/\/platform\.twitter\.com\/embed\/Tweet\.html\?.*\bid=(\d+)/,
		loaders: [/^https?:\/\/platform\.(?:twitter|x)\.com\/widgets\.js/],
		markup: (tag, attrs) => (tag === 'blockquote' && classes(attrs).includes('twitter-tweet') ? { key: '', form: 'script' } : undefined),
		slot: { selector: 'blockquote.twitter-tweet' },
		data: 'https://publish.twitter.com/oembed?omit_script=true&dnt=true&url={url}',
		adapter: 'twitter',
		terms: { study: false, note: 'X\'s terms forbid scraping its pages and widgets without consent: the post is rebuilt from its oEmbed answer alone, which has the text, author and date but not the avatar or counts the widget shows', url: 'https://x.com/en/tos' },
	},
	{
		id: 'twitter-timeline',
		name: 'X (Twitter) timeline',
		kind: 'widget',
		markup: (tag, attrs) => (tag === 'a' && classes(attrs).includes('twitter-timeline') ? { key: attrs.get('href') ?? '', form: 'script' } : undefined),
		slot: { selector: 'a.twitter-timeline' },
		keep: { reason: 'live-at-load', why: 'a timeline shows the newest posts each time it loads' },
		terms: { study: false, note: 'X\'s terms forbid scraping its pages and widgets without consent', url: 'https://x.com/en/tos' },
	},
	{
		id: 'bluesky',
		name: 'Bluesky post',
		kind: 'post',
		frame: /^https?:\/\/embed\.bsky\.app\/embed\/([^?#]+)/,
		loaders: [/^https?:\/\/embed\.bsky\.app\/static\/embed\.js/],
		markup: (tag, attrs) => (tag === 'blockquote' && attrs.get('data-bluesky-uri') ? { key: attrs.get('data-bluesky-uri')!, form: 'script' } : undefined),
		slot: { selector: 'blockquote[data-bluesky-uri]' },
		data: 'https://embed.bsky.app/oembed?format=json&url={url}',
		adapter: 'bluesky',
		terms: { ...VISITOR, note: 'Bluesky\'s public AppView API and oEmbed endpoint are open; the post is rebuilt from them', url: 'https://docs.bsky.app/docs/advanced-guides/embed' },
	},
	{
		id: 'mastodon',
		name: 'Mastodon post',
		kind: 'post',
		frame: /^https?:\/\/[^/]+\/@[\w.]+\/(\d+)\/embed(?:[?#]|$)/,
		loaders: [/^https?:\/\/[^/]+\/embed\.js$/],
		markup: (tag, attrs) => (tag === 'blockquote' && classes(attrs).includes('mastodon-embed') && attrs.get('data-embed-url') ? { key: attrs.get('data-embed-url')!, form: 'script' } : undefined),
		slot: { selector: 'blockquote.mastodon-embed' },
		data: '{origin}/api/v1/statuses/{key}',
		adapter: 'mastodon',
		terms: { ...VISITOR, note: 'the post is read from its server\'s public statuses API, as astro-embed does' },
	},
	{
		id: 'github-button',
		name: 'GitHub button',
		kind: 'button',
		frame: /^https?:\/\/(?:buttons\.github\.io\/buttons\.html#(.+)|ghbtns\.com\/github-btn\.html\?(.+))$/,
		loaders: [/^https?:\/\/buttons\.github\.io\/buttons\.js/],
		markup: (tag, attrs) => (tag === 'a' && classes(attrs).includes('github-button') ? { key: attrs.get('href') ?? '', form: 'script' } : undefined),
		slot: { selector: 'a.github-button' },
		data: 'https://api.github.com/repos/{owner}/{repo}',
		adapter: 'github-button',
		terms: { ...VISITOR, note: 'the count comes from GitHub\'s REST API (unauthenticated, 60 requests an hour; GITHUB_TOKEN raises it); buttons.js is BSD-2-Clause', url: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service' },
	},
	{
		id: 'gist',
		name: 'GitHub gist',
		kind: 'code',
		loaders: [/^https?:\/\/gist\.github\.com\/[\w-]+\/([0-9a-f]+)\.js/],
		slot: { selector: 'script[src*="gist.github.com/"]', after: true },
		data: 'https://api.github.com/gists/{key}',
		adapter: 'gist',
		terms: { ...VISITOR, note: 'the files come from GitHub\'s REST API for gists' },
	},
	{
		id: 'link-card',
		name: 'Link preview',
		kind: 'card',
		frame: /^https?:\/\/(?:cdn\.)?iframe\.ly\/(?:api\/iframe\?.*url=)?([^?#&]+)/,
		loaders: [/^https?:\/\/cdn\.(?:iframe\.ly|embedly\.com)\//],
		markup: (tag, attrs) => (tag === 'a' && classes(attrs).includes('embedly-card') ? { key: attrs.get('href') ?? '', form: 'script' } : undefined),
		slot: { selector: 'a.embedly-card' },
		data: '{url} (Open Graph tags, where robots.txt allows)',
		adapter: 'link-card',
		terms: { ...VISITOR, note: 'the card is built from the linked page\'s Open Graph tags, fetched only where its robots.txt allows' },
	},
	{
		id: 'codepen',
		name: 'CodePen',
		kind: 'code',
		frame: /^https?:\/\/codepen\.io\/[\w-]+\/embed\/(?:preview\/)?(\w+)/,
		loaders: [/^https?:\/\/(?:cpwebassets\.codepen\.io|static\.codepen\.io|public\.codepenassets\.com)\/.*(?:ei|index)\.js/],
		markup: (tag, attrs) => (classes(attrs).includes('codepen') && attrs.get('data-slug-hash') ? { key: attrs.get('data-slug-hash')!, form: 'script' } : undefined),
		slot: { selector: '.codepen[data-slug-hash]' },
		data: 'https://codepen.io/api/oembed?format=json&url={url}',
		terms: VISITOR,
	},
	{ id: 'bunny', name: 'Bunny Stream', kind: 'player', frame: /^https?:\/\/(?:iframe|player)\.mediadelivery\.net\/(?:embed|play)\/(\d+\/[\w-]+)/, terms: UNKNOWN },
	{ id: 'wistia', name: 'Wistia', kind: 'player', frame: /^https?:\/\/fast\.wistia\.(?:net|com)\/embed\/(?:iframe|medias)\/(\w+)/, data: 'https://fast.wistia.com/oembed?url={url}', terms: UNKNOWN },
	{ id: 'loom', name: 'Loom', kind: 'player', frame: /^https?:\/\/(?:www\.)?loom\.com\/embed\/(\w+)/, data: 'https://www.loom.com/v1/oembed?url={url}', terms: UNKNOWN },
	{ id: 'dailymotion', name: 'Dailymotion', kind: 'player', frame: /^https?:\/\/(?:www\.|geo\.)?dailymotion\.com\/(?:embed\/video\/|player\.html\?video=)(\w+)/, data: 'https://www.dailymotion.com/services/oembed?url={url}', terms: UNKNOWN },
	{ id: 'soundcloud', name: 'SoundCloud', kind: 'audio', frame: /^https?:\/\/w\.soundcloud\.com\/player\/\?(?:.*&)?url=([^&]+)/, data: 'https://soundcloud.com/oembed?format=json&url={url}', terms: UNKNOWN },
	{ id: 'spotify', name: 'Spotify', kind: 'audio', frame: /^https?:\/\/open\.spotify\.com\/embed\/((?:track|album|playlist|episode|show|artist)\/\w+)/, data: 'https://open.spotify.com/oembed?url={url}', keep: { reason: 'terms', why: 'Spotify\'s developer terms restrict changing or recreating its embedded player' }, terms: { study: false, note: 'Spotify\'s developer terms restrict changing or recreating its embedded player', url: 'https://developer.spotify.com/terms' } },
	{ id: 'stackblitz', name: 'StackBlitz', kind: 'code', frame: /^https?:\/\/stackblitz\.com\/(?:edit|github)\/([^?#]+)/, terms: UNKNOWN },
	{ id: 'codesandbox', name: 'CodeSandbox', kind: 'code', frame: /^https?:\/\/codesandbox\.io\/(?:embed|p\/sandbox)\/([^?#]+)/, terms: UNKNOWN },
	{ id: 'figma', name: 'Figma', kind: 'widget', frame: /^https?:\/\/(?:www\.|embed\.)?figma\.com\/(?:embed|file|design|proto)\b/, keep: { reason: 'auth', why: 'a Figma file shows what the signed-in visitor may see' }, terms: VISITOR },
	{ id: 'google-maps', name: 'Google Maps', kind: 'map', frame: /^https?:\/\/(?:www\.)?google\.com\/maps\/embed|^https?:\/\/maps\.google\.com\//, keep: { reason: 'terms', why: 'Google Maps Platform terms do not allow caching or recreating Maps content outside the Maps service' }, terms: { study: false, note: 'Google Maps Platform terms do not allow caching or recreating Maps content outside the Maps service', url: 'https://cloud.google.com/maps-platform/terms' } },
	{ id: 'google-docs', name: 'Google Docs', kind: 'widget', frame: /^https?:\/\/(?:docs|calendar|drive)\.google\.com\//, keep: { reason: 'auth', why: 'a Google document or calendar shows what the signed-in visitor may see, and changes when its owner edits it' }, terms: VISITOR },
	{ id: 'twitch', name: 'Twitch', kind: 'player', frame: /^https?:\/\/(?:player|clips)\.twitch\.tv\//, keep: { reason: 'live-at-load', why: 'a live stream: what it shows changes by the minute' }, terms: VISITOR },
	...['widget.intercom.io', 'js.intercomcdn.com', 'client.crisp.chat', 'js.driftt.com', 'embed.tawk.to', 'static.zdassets.com', 'js.hs-scripts.com', 'js.usemessages.com', 'cdn.livechatinc.com', 'static.olark.com'].map((host): Provider => ({ id: `chat:${host}`, name: `chat widget (${host})`, kind: 'widget', loaders: [new RegExp(`^https?://${host.replaceAll('.', '\\.')}/`)], keep: { reason: 'live-at-load', why: 'a chat widget: it connects to its service at load to show agents online and unread messages' }, terms: VISITOR })),
	...['cdn.carbonads.com', 'srv.carbonads.net', 'pagead2.googlesyndication.com', 'media.ethicalads.io', 'srv.buysellads.com'].map((host): Provider => ({ id: `ads:${host}`, name: `ads (${host})`, kind: 'widget', loaders: [new RegExp(`^https?://${host.replaceAll('.', '\\.')}/`)], frame: new RegExp(`^https?://${host.replaceAll('.', '\\.')}/`), keep: { reason: 'ads', why: 'an ad: each load is a new impression the ad network counts and pays for' }, terms: VISITOR })),
	...['www.google.com/recaptcha', 'www.recaptcha.net', 'js.hcaptcha.com', 'challenges.cloudflare.com', 'accounts.google.com/gsi', 'js.stripe.com', 'www.paypal.com/sdk', 'giscus.app', 'utteranc.es'].map((host): Provider => ({ id: `auth:${host.split('/')[0]}`, name: `${host.split('/')[0]}`, kind: 'widget', loaders: [new RegExp(`^https?://${host.replaceAll('.', '\\.')}`)], frame: new RegExp(`^https?://${host.replaceAll('.', '\\.')}`), keep: { reason: 'auth', why: 'it signs the visitor in, checks they are human, takes a payment or shows their own comments: it must run live' }, terms: VISITOR })),
	{ id: 'disqus', name: 'Disqus comments', kind: 'widget', loaders: [/^https?:\/\/[\w-]+\.disqus\.com\/embed\.js/], frame: /^https?:\/\/disqus\.com\/embed\//, keep: { reason: 'auth', why: 'comments show the signed-in visitor\'s own state and the newest replies' }, terms: VISITOR },
];

/** A provider for an embed no catalog entry names: its host, studied like any other. */
export function hostProvider(url: URL): Provider {
	return { id: `host:${url.hostname}`, name: url.hostname, kind: 'widget', terms: UNKNOWN };
}

export const providerById = (id: string): Provider | undefined => PROVIDERS.find((p) => p.id === id) ?? (id.startsWith('host:') ? hostProvider(new URL(`https://${id.slice(5)}`)) : undefined);

export function frameProvider(src: string): { provider: Provider; key: string } | undefined {
	for (const provider of PROVIDERS) {
		const m = provider.frame?.exec(src);
		if (m) return { provider, key: m.slice(1).find((g) => g !== undefined) ?? '' };
	}
	return undefined;
}

export function loaderProvider(src: string): { provider: Provider; key: string } | undefined {
	for (const provider of PROVIDERS) {
		for (const loader of provider.loaders ?? []) {
			const m = loader.exec(src);
			if (m) return { provider, key: m[1] ?? '' };
		}
	}
	return undefined;
}

/** Every placeholder a loader turns into its embed, for the page-side slot tracker. */
export const SLOTS: readonly { readonly selector: string; readonly after?: boolean; readonly provider: string }[] = PROVIDERS.flatMap((p) => (p.slot ? [{ ...p.slot, provider: p.id }] : []));
