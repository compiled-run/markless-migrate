// The click-to-load YouTube preview docusaurus.io draws with react-lite-youtube-embed, in its own markup and classes (the
// theme's stylesheet draws it), fed by youtube-facades.json: the poster from YouTube's image address, nothing of
// YouTube's at load. Hovering it preconnects to the player's hosts, as the library does; a click anywhere on it, or Enter
// on its play button, marks it activated and puts the library's iframe inside it, playing.
import videos from './youtube-facades.json';

type Facade = {
	/** The id of the embed it stands in for, from .migrate/embeds.json. */
	readonly embed: string;
	readonly id: string;
	readonly title: string;
	readonly poster: string;
	/** The player parameters the site passes, after the library's own autoplay=1. */
	readonly params: string;
};

const ALLOW = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
const PRECONNECT = ['https://www.youtube-nocookie.com', 'https://www.google.com'];

/** `embed` names the video's entry in youtube-facades.json. */
export default function YouTubeFacade({ embed }: { readonly embed: string }) @{
	const video = (videos as Readonly<Record<string, Facade>>)[embed]!;

	<article
		class="yt-lite "
		data-title={video.title}
		role="img"
		aria-label={`${video.title} - YouTube video preview`}
		style={`background-image: url("${video.poster}"); --aspect-ratio: 56.25%;`}
		data-markless-embed={video.embed}
		onPointerOver={() => {
			for (const href of PRECONNECT) {
				if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
				const link = document.createElement('link');
				link.rel = 'preconnect';
				link.href = href;
				document.head.append(link);
			}
		}}
		onClick={(event: MouseEvent) => {
			const article = (event.target as Element).closest('article.yt-lite');
			if (!article || article.classList.contains('lyt-activated')) return;
			article.classList.add('lyt-activated');
			article.removeAttribute('role');
			article.removeAttribute('aria-label');
			const button = article.querySelector('.lty-playbtn');
			button?.setAttribute('tabindex', '-1');
			button?.setAttribute('aria-hidden', 'true');
			const frame = document.createElement('iframe');
			const attributes = { class: '', title: video.title, width: '560', height: '315', allow: ALLOW, allowfullscreen: '', src: `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&${video.params}`, referrerpolicy: 'strict-origin-when-cross-origin' };
			for (const [name, value] of Object.entries(attributes)) frame.setAttribute(name, value);
			article.append(frame);
		}}
	>
		<button type="button" class="lty-playbtn" aria-label={`Watch ${video.title}`} tabindex="0">
			<span class="lty-visually-hidden">{"Watch"}</span>
		</button>
	</article>
}
