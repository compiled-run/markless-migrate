// react-lite-youtube-embed as it renders before a visitor plays the video: the poster with a play button.
// lib/site.ts adds the preconnect links on hover and the player iframe on click, as the library does.
export default function LiteYouTubeEmbed({ id, title, poster = 'hqdefault', webp, announce = 'Watch', params, wrapperClass = 'yt-lite', playerClass = 'lty-playbtn', aspectHeight = 9, aspectWidth = 16, noscriptFallback = true }) {
	const format = webp ? 'webp' : 'jpg';
	const folder = webp ? 'vi_webp' : 'vi';
	const image = poster === 'maxresdefault' ? `https://img.youtube.com/${folder}/${encodeURIComponent(id)}/${poster}.${format}` : `https://i.ytimg.com/${folder}/${encodeURIComponent(id)}/${poster}.${format}`;
	const style = `background-image: url("${image}"); --aspect-ratio: ${(aspectHeight / aspectWidth) * 100}%;`;
	return (
		<>
			<link rel="preload" href={image} as="image" />
			{noscriptFallback && (
				<noscript>
					<a href={`https://www.youtube.com/watch?v=${id}`} aria-label={`${announce} ${title} on YouTube`}>
						{`${announce} "${title}" on YouTube`}
					</a>
				</noscript>
			)}
			<article className={`${wrapperClass} `} data-title={title} role="img" aria-label={`${title} - YouTube video preview`} style={style} data-mm-youtube={JSON.stringify({ id, params, title })}>
				<button type="button" className={playerClass} aria-label={`${announce} ${title}`} tabIndex={0}>
					<span className="lty-visually-hidden">{announce}</span>
				</button>
			</article>
		</>
	);
}
