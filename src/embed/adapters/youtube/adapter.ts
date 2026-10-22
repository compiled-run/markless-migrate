import type { EmbedData } from '../../data.ts';
import type { EmbedUse } from '../../types.ts';
import type { EmbedAdapter } from '../index.ts';

const FRAME = ['src', 'width', 'height', 'title', 'frameborder', 'allow', 'allowfullscreen', 'referrerpolicy', 'loading', 'class', 'style'];

/** The channel picture at the size the player draws it (68 px for its 36 px circle), on the host the player loads it from. */
export function playerAvatar(url: string | undefined): string {
	if (!url) return '';
	return url.replace(/^https:\/\/yt3\.googleusercontent\.com\//, 'https://yt3.ggpht.com/').replace(/=s\d+-/, '=s68-');
}

export const YOUTUBE: EmbedAdapter = {
	id: 'youtube',
	provider: 'youtube',
	dir: 'youtube',
	module: 'youtube.tsrx',
	component: 'YouTube',
	files: ['youtube.tsrx'],
	publicFiles: ['roboto-latin.woff2', 'ROBOTO-LICENSE.txt'],
	certifiedBy: 'markless-migrate run on vite.dev /blog/announcing-vite6 (the component its agent wrote, promoted here): the embed step at desktop and mobile, light and dark, at rest, hovered and focused, and activation by click and by Enter',
	notes: [
		'Pass fill when the page sizes the frame to fill a padded wrapper (position: absolute; width: 100%; height: 100%); otherwise the component takes the frame\'s width and height attributes, scaled down to fit.',
		'Activation adds autoplay=1 and enablejsapi=1 to the frame\'s address and starts the player through its API once it loads: a phone\'s player ignores autoplay from a frame the page put in, as lite-youtube-embed notes.',
		'The player\'s focus is matched as YouTube draws it, which shows no ring on its play button.',
	],
	props(use: EmbedUse, data: EmbedData) {
		const f = data.fields;
		const id = String(f.id ?? use.key);
		const frame = Object.fromEntries(FRAME.flatMap((k) => (use.attributes[k] !== undefined ? [[k, use.attributes[k]!]] : [])));
		return {
			embed: use.id,
			id,
			watch: String(f.watch ?? `https://www.youtube.com/watch?v=${id}`),
			title: String(f.title ?? ''),
			author: String(f.author ?? ''),
			authorUrl: String(f.authorUrl ?? ''),
			poster: String(f.poster ?? f.thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
			posterSmall: `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
			avatar: playerAvatar(typeof f.avatar === 'string' ? f.avatar : undefined),
			frame: Object.keys(frame).length ? frame : { src: `https://www.youtube.com/embed/${id}`, width: '560', height: '315', title: 'YouTube video player', frameborder: '0', allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowfullscreen: '' },
			width: Number(use.attributes.width ?? 560),
			height: Number(use.attributes.height ?? 315),
		};
	},
};
