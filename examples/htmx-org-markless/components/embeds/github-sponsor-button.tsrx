// GitHub's "Sponsor" button frame (https://github.com/sponsors/<account>/button) as GitHub draws it, in Markless markup:
// no frame and no script at load. The root takes the frame's place and the page's inline style for it; the link inside
// is GitHub's Primer secondary button with the colours of GitHub's light and dark themes, which the frame follows. It is
// a layer of its own (will-change) so its text lands on whole pixels, as a frame's content does.
import sponsors from './github-sponsors.json';

type SponsorButtonData = {
	/** The id of the embed it stands in for, from .migrate/embeds.json. */
	readonly embed: string;
	readonly href: string;
	readonly ariaLabel: string;
	readonly text: string;
};

const HEART = 'm8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002ZM4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.58 20.58 0 0 0 8 13.393a20.58 20.58 0 0 0 3.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 0 1-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5Z';

/** `embed` names the embed's entry in github-sponsors.json; `style` is the inline style the page gave the frame. */
export function GitHubSponsorButton({ embed, style }: { readonly embed: string; readonly style: string }) @{
	const data = (sponsors as Readonly<Record<string, SponsorButtonData>>)[embed]!;
	<span class="ghs-host" data-markless-embed={data.embed} style={style}>
		<style>
			.ghs-host { display: block; width: 114px; height: 32px; overflow: hidden; background-color: var(--ghs-canvas); --ghs-canvas: #fff; --ghs-color: #25292e; --ghs-bg: #f6f8fa; --ghs-hover-bg: #eff2f5; --ghs-active-bg: #e6eaef; --ghs-border: #d1d9e0; --ghs-heart: #bf3989; --ghs-focus: #0969da; }
			@media (prefers-color-scheme: dark) {
				.ghs-host { --ghs-canvas: #0d1117; --ghs-color: #f0f6fc; --ghs-bg: #212830; --ghs-hover-bg: #262c36; --ghs-active-bg: #2a313c; --ghs-border: #3d444d; --ghs-heart: #db61a2; --ghs-focus: #1f6feb; }
			}
			.ghs-btn { position: relative; display: flex; align-items: center; justify-content: space-between; width: 100%; height: 32px; padding: 0 12px; font-family: "Mona Sans VF", -apple-system, "system-ui", "Segoe UI", "Noto Sans Backtick Fix", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"; font-size: 14px; font-weight: 400; font-style: normal; line-height: 21px; letter-spacing: normal; text-align: center; text-decoration: none; text-transform: none; color: var(--ghs-color); background-color: var(--ghs-bg); border: 1px solid var(--ghs-border); border-radius: 0; cursor: pointer; will-change: transform; user-select: none; transition: color 0.08s cubic-bezier(0.65, 0, 0.35, 1), fill 0.08s cubic-bezier(0.65, 0, 0.35, 1), background-color 0.08s cubic-bezier(0.65, 0, 0.35, 1), border-color 0.08s cubic-bezier(0.65, 0, 0.35, 1); }
			a.ghs-btn[href]:hover { opacity: 1; color: var(--ghs-color); background-color: var(--ghs-hover-bg); }
			a.ghs-btn[href]:active { background-color: var(--ghs-active-bg); }
			.ghs-btn:focus { outline: none; }
			.ghs-btn:focus-visible { outline: 2px solid var(--ghs-focus); outline-offset: -2px; }
			.ghs-content { flex: 1 0 auto; display: grid; grid-template-columns: min-content minmax(0, auto) min-content; grid-template-areas: "leadingVisual text trailingVisual"; place-content: center; align-items: center; }
			.ghs-visual { grid-area: leadingVisual; display: flex; margin-right: 8px; pointer-events: none; }
			.ghs-heart { display: block; color: var(--ghs-heart); fill: currentColor; }
			.ghs-label { grid-area: text; white-space: nowrap; }
		</style>
		<a class="ghs-btn" href={data.href} aria-label={data.ariaLabel} target="_top">
			<span class="ghs-content">
				<span class="ghs-visual">
					<svg class="ghs-heart" aria-hidden="true" height="16" viewBox="0 0 16 16" width="16"><path d={HEART}></path></svg>
				</span>
				<span class="ghs-label">{data.text}</span>
			</span>
		</a>
	</span>
}
