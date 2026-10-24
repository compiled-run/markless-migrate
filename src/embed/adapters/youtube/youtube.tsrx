// YouTube's embedded player as it draws itself before it plays (its cued state: the poster, the title and channel, the
// play button and "Watch on YouTube"), in Markless markup fed by the video's oEmbed answer, from lib/embeds/data.json.
// Written by markless-migrate run on vite.dev's announcing-vite6 post and kept for every site: see adapter.ts.
// The poster and channel picture load from YouTube's own addresses; Roboto (SIL OFL 1.1, ROBOTO-LICENSE.txt) is served
// by the app. A click anywhere but its links, or Enter on its play button, puts the page's own iframe in its place, playing.
import embeds from '../data.json';

export type YouTubeData = {
	/** The id of the embed it stands in for, from .migrate/embeds.json. */
	readonly embed: string;
	readonly id: string;
	readonly watch: string;
	readonly title: string;
	readonly author: string;
	readonly authorUrl: string;
	readonly poster: string;
	readonly posterSmall: string;
	readonly avatar: string;
	/** The old page's iframe, attribute by attribute: what activation puts in the component's place. */
	readonly frame: Readonly<Record<string, string>>;
	/** The frame's own width and height, for a page that sizes it by its attributes. */
	readonly width: number;
	readonly height: number;
};

const PLAY = 'M63 14.87a7.885 7.885 0 00-5.56-5.56C52.54 8 32.88 8 32.88 8S13.23 8 8.32 9.31c-2.7.72-4.83 2.85-5.56 5.56C1.45 19.77 1.45 30 1.45 30s0 10.23 1.31 15.13c.72 2.7 2.85 4.83 5.56 5.56C13.23 52 32.88 52 32.88 52s19.66 0 24.56-1.31c2.7-.72 4.83-2.85 5.56-5.56C64.31 40.23 64.31 30 64.31 30s0-10.23-1.31-15.13z';
const SHARE = 'M10 3.158V7.51c-5.428.223-8.27 3.75-8.875 11.199-.04.487-.07.975-.09 1.464l-.014.395c-.014.473.578.684.88.32.302-.368.61-.73.925-1.086l.244-.273c1.79-1.967 3-2.677 4.93-2.917a18.011 18.011 0 012-.112v4.346a1 1 0 001.646.763l9.805-8.297 1.55-1.31-1.55-1.31-9.805-8.297A1 1 0 0010 3.158Zm2 6.27v.002-4.116l7.904 6.688L12 18.689v-4.212l-2.023.024c-1.935.022-3.587.17-5.197 1.024a9 9 0 00-1.348.893c.355-1.947.916-3.39 1.63-4.425 1.062-1.541 2.607-2.385 5.02-2.485L12 9.428Z';
const WORDMARK = 'M 16.687006,0.99998524 C 13.551069,1.0327972 7.0245114,1.1624852 4.9995126,1.6874852 c -1.4999991,0.4 -2.5999984,1.6 -2.9999982,3 -0.6999995,2.7 -0.6874995,8.3124998 -0.6874995,8.3124998 0,0 -0.0125,5.6125 0.6874995,8.3125 0.3999998,1.5 1.5999991,2.6 2.9999982,3 2.6999984,0.7 13.4062424,0.6875 13.4062424,0.6875 0,0 10.706243,0.0125 13.406241,-0.6875 1.5,-0.4 2.599999,-1.6 2.999999,-3 0.699999,-2.7 0.687499,-8.3125 0.687499,-8.3125 0,0 0.1125,-5.6124998 -0.687499,-8.3124998 -0.4,-1.5 -1.599999,-2.6 -2.999999,-3 C 29.111998,0.98748524 18.405755,0.99998524 18.405755,0.99998524 c 0,0 -0.673437,-0.010938 -1.718749,0 z m 72.218706,0.90624996 0,21.2812498 2.781248,0 0.3125,-1.375 0.09375,0 c 0.3,0.5 0.71875,0.8875 1.218749,1.1875 0.5,0.3 1.0875,0.40625 1.687499,0.40625 1.1,0 1.999999,-0.49375 2.499999,-1.59375 0.5,-1.1 0.812499,-2.70625 0.812499,-4.90625 l 0,-2.40625 c 0,-1.6 -0.1125,-2.90625 -0.312499,-3.90625 -0.2,-0.8999999 -0.5,-1.5937499 -1,-2.0937499 -0.5,-0.4 -1.106249,-0.5937499 -1.906249,-0.5937499 -0.599999,0 -1.187499,0.1999999 -1.687499,0.4999999 -0.499999,0.3 -1.018749,0.80625 -1.218749,1.40625 l 0,-7.9062499 -3.281248,0 z m -49.99997,0.78125 3.906248,13.9062498 0.1875,6.71875 3.312498,0 0,-6.71875 3.874997,-13.9062498 -3.374998,0 -1.406249,6.3124999 c -0.4,1.8999999 -0.712499,3.1999999 -0.812499,3.9999999 l -0.09375,0 c -0.2,-1.1 -0.5125,-2.4 -0.8125,-3.9999999 l -1.374999,-6.3124999 -3.406248,0 z m 29.593732,0 0,2.71875 3.406248,0 0,17.9062498 3.281248,0 0,-17.9062498 3.406248,0 c 0,0 0.0062,-2.71875 -0.09375,-2.71875 l -9.999994,0 z m -53.499967,5.125 8.906244,5.1874998 -8.906244,5.09375 0,-10.2812498 z m 89.406193,0.09375 c -1.7,0 -2.89375,0.5937499 -3.59375,1.5937499 -0.69999,0.9999999 -0.999995,2.6062499 -0.999995,4.9062499 l 0,2.59375 c 0,2.2 0.300005,3.90625 0.999995,4.90625 0.7,1.1 1.8,1.59375 3.5,1.59375 1.4,0 2.3875,-0.3 3.1875,-1 0.7,-0.7 1.09375,-1.69375 1.09375,-3.09375 l 0,-0.5 -2.90625,-0.21875 c 0,1 -0.0812,1.6 -0.28125,2 -0.1,0.4 -0.5,0.625 -1,0.625 -0.3,0 -0.6125,-0.1125 -0.8125,-0.3125 -0.2,-0.3 -0.30625,-0.59375 -0.40625,-1.09375 -0.1,-0.5 -0.0937,-1.21875 -0.0937,-2.21875 l 0,-0.78125 5.71875,-0.09375 0,-2.625 c 0,-1.6 -0.10625,-2.7875 -0.40625,-3.6875 -0.2,-0.8999999 -0.7125,-1.5999999 -1.3125,-1.9999999 -0.7,-0.4 -1.4875,-0.5937499 -2.6875,-0.5937499 z m -50.499967,0.09375 c -1.099999,0 -2.018749,0.1874999 -2.718748,0.6874999 -0.7,0.4 -1.2,1.125 -1.499999,2.1249999 -0.3,1 -0.5,2.275 -0.5,3.875 l 0,2.21875 c 0,1.5 0.10625,2.78125 0.40625,3.78125 0.2,0.9 0.706249,1.625 1.406249,2.125 0.699999,0.5 1.712499,0.68125 2.812498,0.78125 1.199999,0 2.081249,-0.2875 2.781249,-0.6875 0.699999,-0.4 1.099999,-1.09375 1.499999,-2.09375 0.399999,-1 0.499999,-2.30625 0.499999,-3.90625 l 0,-2.21875 c 0,-1.6 -0.2,-2.875 -0.499999,-3.875 -0.3,-0.8999999 -0.8,-1.6249999 -1.499999,-2.1249999 -0.7,-0.5 -1.5875,-0.6874999 -2.687499,-0.6874999 z m 12.187493,0.09375 0,11.9062498 c -0.1,0.3 -0.29375,0.4875 -0.59375,0.6875 -0.2,0.2 -0.5125,0.3125 -0.812499,0.3125 -0.3,0 -0.5875,-0.10625 -0.6875,-0.40625 -0.1,-0.3 -0.1875,-0.70625 -0.1875,-1.40625 l 0,-10.9999998 -3.406248,0 0,11.2187498 c 0,1.4 0.1875,2.39375 0.6875,3.09375 0.499999,0.7 1.218749,1 2.218748,1 1.4,0 2.487499,-0.69375 3.187499,-2.09375 l 0.09375,0 0.3125,1.78125 2.593749,0 0,-14.9999998 c 0,0 -3.406248,0.0062 -3.406248,-0.09375 z m 17.312489,0 0,11.9062498 c -0.1,0.3 -0.293749,0.4875 -0.593749,0.6875 -0.2,0.2 -0.5125,0.3125 -0.8125,0.3125 -0.3,0 -0.587499,-0.10625 -0.687499,-0.40625 -0.1,-0.3 -0.21875,-0.70625 -0.21875,-1.40625 l 0,-10.9999998 -3.406248,0 0,11.2187498 c 0,1.4 0.21875,2.39375 0.718749,3.09375 0.5,0.7 1.1875,1 2.187499,1 1.399999,0 2.518749,-0.69375 3.218748,-2.09375 l 0.09375,0 0.28125,1.78125 2.624998,0 0,-14.9999998 c 0,0 -3.406248,0.0062 -3.406248,-0.09375 z m 20.906235,2.0937498 c 0.4,0 0.58125,0.1125 0.78125,0.3125 0.2,0.3 0.30625,0.59375 0.40625,1.09375 0.1,0.5 0.0937,1.21875 0.0937,2.21875 l 0,1.09375 -2.5,0 0,-1.09375 c 0,-1 -0.006,-1.71875 0.0937,-2.21875 0,-0.4 0.1125,-0.8 0.3125,-1 0.2,-0.3 0.5125,-0.40625 0.8125,-0.40625 z m -50.499967,0.125 c 0.5,0 0.8,0.1875 1,0.6875 0.199999,0.5 0.281249,1.30625 0.281249,2.40625 l 0,4.6875 c 0,1.1 -0.08125,1.90625 -0.281249,2.40625 -0.2,0.5 -0.5,0.6875 -1,0.6875 -0.5,0 -0.799999,-0.1875 -0.999999,-0.6875 -0.2,-0.5 -0.3125,-1.30625 -0.3125,-2.40625 l 0,-4.6875 c 0,-1.1 0.1125,-1.90625 0.3125,-2.40625 0.2,-0.5 0.499999,-0.6875 0.999999,-0.6875 z m 39.687476,0.09375 c 0.3,0 0.6125,0.10625 0.8125,0.40625 0.2,0.3 0.275,0.675 0.375,1.375 0.1,0.6 0.124999,1.51875 0.124999,2.71875 l 0.09375,1.90625 c 0,1.1 0.0062,1.99375 -0.09375,2.59375 -0.1,0.6 -0.199999,1.08125 -0.499999,1.28125 -0.2,0.3 -0.50625,0.40625 -0.90625,0.40625 -0.3,0 -0.512499,-0.0875 -0.812499,-0.1875 -0.2,-0.1 -0.39375,-0.29375 -0.59375,-0.59375 l 0,-8.5 c 0.1,-0.4 0.29375,-0.7 0.59375,-1 0.3,-0.3 0.606249,-0.40625 0.906249,-0.40625 z';

/** Starts the player through its JavaScript API once it has loaded: a phone's YouTube player ignores autoplay=1 from a frame the page put in. */
function startWhenReady(frame: HTMLIFrameElement): void {
	const send = () => frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
	frame.addEventListener('load', () => {
		frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
		send();
		setTimeout(send, 500);
	});
}

/** `embed` names the video's entry in lib/embeds/data.json. `fill`: the page sizes the frame to fill its parent (a padded wrapper); otherwise the component takes the frame's own width and height, scaled down to fit. */
export function YouTube({ embed, fill }: { readonly embed: string; readonly fill?: boolean }) @{
	const v = (embeds as Readonly<Record<string, YouTubeData>>)[embed]!;
	const size = fill === true ? undefined : `width: ${v.width}px; max-width: 100%; aspect-ratio: ${v.width} / ${v.height};`;
	<div
		class={fill === true ? 'yte yte-fill' : 'yte'}
		style={size}
		data-markless-embed={v.embed}
		onClick={(event: MouseEvent) => {
			const target = event.target as Element;
			const host = event.currentTarget as HTMLElement;
			const cover = host.querySelector(':scope > .yte-cover');
			if (!cover || target.closest('a')) return;
			const frame = document.createElement('iframe');
			const src = new URL(v.frame.src ?? `https://www.youtube.com/embed/${v.id}`);
			src.searchParams.set('autoplay', '1');
			src.searchParams.set('enablejsapi', '1');
			for (const [name, value] of Object.entries(v.frame)) frame.setAttribute(name, name === 'src' ? src.href : value);
			if (!v.frame.src) frame.src = src.href;
			startWhenReady(frame);
			cover.replaceWith(frame);
			frame.focus();
		}}
	>
		<style>
			@font-face { font-family: 'Markless YouTube Roboto'; font-style: normal; font-weight: 400; font-stretch: 100%; src: url(/embeds/youtube/roboto-latin.woff2) format('woff2'); }
			@font-face { font-family: 'Markless YouTube Roboto'; font-style: normal; font-weight: 500; font-stretch: 100%; src: url(/embeds/youtube/roboto-latin.woff2) format('woff2'); }
			.yte { position: relative; display: block; overflow: hidden; background: #000; color: #fff; container-type: size; cursor: pointer; will-change: transform; font-family: 'Markless YouTube Roboto', Arial, sans-serif; font-size: 12px; font-weight: 400; font-style: normal; line-height: normal; letter-spacing: normal; text-align: start; text-transform: none; -webkit-font-smoothing: auto; text-rendering: auto; font-feature-settings: normal; font-variation-settings: normal; font-synthesis: weight style small-caps; text-autospace: no-autospace; text-size-adjust: auto; tab-size: 8; -webkit-tap-highlight-color: rgba(0, 0, 0, .18); }
			.yte * { box-sizing: content-box; margin: 0; }
			.yte a, .yte a:hover { color: #fff; text-decoration: none; transition: none; }
			.yte .yte-thumb { position: absolute; top: 0; left: 0; display: block; width: 100%; height: 100%; max-width: none; object-fit: cover; object-position: 50% 50%; }
			.yte .yte-thumb-small { display: none; }
			.yte .yte-shade { position: absolute; top: 0; left: 0; width: 100%; height: 70px; background: linear-gradient(rgba(0, 0, 0, .8), rgba(0, 0, 0, .6), rgba(0, 0, 0, 0)); }
			.yte .yte-play { position: absolute; top: 50%; left: 50%; margin: -36px 0 0 -36px; width: 72px; height: 72px; padding: 0; border: 0; background: transparent; cursor: pointer; color: rgb(255, 0, 51); fill: currentColor; outline: none; box-sizing: border-box; }
			.yte .yte-play svg { display: block; width: 100%; height: 100%; pointer-events: none; }
			.yte .yte-top { position: absolute; top: 0; left: 14px; right: 24px; height: 52px; padding: 0 12px; box-sizing: border-box; }
			.yte .yte-text { padding-left: 52px; overflow: hidden; }
			.yte .yte-title { display: block; max-width: 100%; padding-top: 10px; overflow: hidden; white-space: nowrap; font-size: 20px; font-weight: 700; line-height: 28px; font-variation-settings: "wdth" 100; mask-image: linear-gradient(to right, #fff 95%, rgba(0, 0, 0, 0)); }
			.yte .yte-channel { display: block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; font-weight: 400; line-height: 1.1; }
			.yte .yte-avatar { position: absolute; top: 16px; left: 16px; width: 36px; height: 36px; border-radius: 50%; display: block; }
			.yte .yte-menu { position: absolute; left: 30px; right: 30px; bottom: 12px; height: 48px; display: flex; align-items: center; justify-content: space-between; }
			.yte .yte-share { display: flex; width: 56px; height: 48px; padding: 4px 0; box-sizing: border-box; background: rgba(0, 0, 0, .3); border-radius: 48px; }
			.yte .yte-share span { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; margin-left: 8px; }
			.yte .yte-share svg { display: block; width: 24px; height: 24px; fill: #fff; filter: drop-shadow(rgba(0, 0, 0, .8) 0 0 1px); }
			.yte .yte-watch { display: flex; align-items: center; justify-content: center; height: 48px; padding: 0 24px; border-radius: 24px; background: rgba(0, 0, 0, .3); font-size: 18px; font-weight: 500; line-height: 48px; white-space: nowrap; outline: none; }
			.yte .yte-watch > span { overflow: hidden; font-weight: 100; }
			.yte .yte-mark { display: inline-block; vertical-align: middle; position: relative; top: -.07em; width: 90px; height: 20px; }
			.yte .yte-mark svg { display: block; width: 100%; height: 100%; fill: #fff; }
			@container (max-height: 221px) {
				.yte .yte-thumb-large { display: none; }
				.yte .yte-thumb-small { display: block; }
				.yte .yte-top { left: 0; right: 0; }
				.yte .yte-title { font-size: 18px; line-height: 26px; }
				.yte .yte-menu { left: 12px; right: 12px; bottom: 2px; }
				.yte .yte-watch { height: 40px; padding: 0 20px; }
			}
					.yte-fill { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
			.yte iframe { display: block; width: 100%; height: 100%; border: 0; }
		</style>
		<div class="yte-cover">
			<img class="yte-thumb yte-thumb-large" src={v.poster} alt="" />
			<img class="yte-thumb yte-thumb-small" src={v.posterSmall} alt="" />
			<div class="yte-shade"></div>
			<button class="yte-play" type="button" aria-label={`Play video: ${v.title}`}>
				<svg viewBox="0 0 67 60" aria-hidden="true"><path d={PLAY}></path><path fill="#FFF" d="M26.6 39.43L42.93 30 26.6 20.57z"></path></svg>
			</button>
			<div class="yte-top">
				<img class="yte-avatar" src={v.avatar} alt="" />
				<div class="yte-text">
					<a class="yte-title no-icon" href={v.watch} target="_blank" rel="noopener">{v.title}</a>
					<a class="yte-channel no-icon" href={v.authorUrl} target="_blank" rel="noopener">{v.author}</a>
				</div>
			</div>
			<div class="yte-menu">
				<div class="yte-share" aria-hidden="true"><span><svg viewBox="0 0 24 24"><path d={SHARE}></path></svg></span></div>
				<a class="yte-watch" href={v.watch} target="_blank" rel="noopener" aria-label="Watch on YouTube"><span>Watch on<span class="yte-mark"><svg viewBox="0 0 110 26" aria-hidden="true"><path d={WORDMARK}></path></svg></span></span></a>
			</div>
		</div>
	</div>
}
