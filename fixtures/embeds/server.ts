// A video provider no adapter knows (shaped like Bunny Stream: a player page per video, poster, title and a play
// button), an old page that embeds it in an iframe, and new pages with a Markless-style component in its place.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'old' | 'faithful' | 'wrong-hover' | 'no-activation' | 'dropped' | 'kept';

const PLAYER_CSS = `
.mm-player { position: absolute; inset: 0; margin: 0; background: linear-gradient(135deg, #1d2b64, #f8cdda); font: 600 22px/1.3 Arial, sans-serif; color: #fff; overflow: hidden; }
.mm-player h1 { position: absolute; left: 20px; top: 16px; margin: 0; font: inherit; }
.mm-player .play { position: absolute; left: 50%; top: 50%; width: 88px; height: 62px; margin: -31px 0 0 -44px; border: 0; border-radius: 14px; background: rgba(23, 23, 23, .8); cursor: pointer; }
.mm-player .play:hover { background: #e11d48; }
.mm-player .play:focus-visible { outline: 3px solid #fde047; outline-offset: 2px; }
.mm-player .play::after { content: ''; position: absolute; left: 36px; top: 19px; border-style: solid; border-width: 12px 0 12px 20px; border-color: transparent transparent transparent #fff; }
`;
const PLAYER_BODY = `<h1>Launch keynote</h1><button class="play" type="button" aria-label="Play Launch keynote"></button>`;

function player(autoplay: boolean): string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>Launch keynote</title><style>html,body{margin:0;height:100%}${PLAYER_CSS} video{position:absolute;inset:0;width:100%;height:100%;display:none;background:#000}</style></head>
<body><div class="mm-player">${PLAYER_BODY}</div><video muted playsinline></video><script>
const video = document.querySelector('video');
const play = () => { const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); let i = 0; setInterval(() => { g.fillStyle = 'hsl(' + (i++ * 7) + ' 70% 50%)'; g.fillRect(0, 0, 64, 36); }, 40); video.srcObject = c.captureStream(25); video.style.display = 'block'; document.querySelector('.mm-player').remove(); video.play(); };
document.querySelector('.play').addEventListener('click', play);
${autoplay ? 'play();' : ''}
</script></body></html>`;
}

const FRAME = (provider: string) => `<iframe src="${provider}/embed/4242/launch-keynote" width="640" height="360" style="border: 0" title="Launch keynote" allow="autoplay; fullscreen" allowfullscreen></iframe>`;

function component(provider: string, variant: Variant): string {
	const css = variant === 'wrong-hover' ? PLAYER_CSS.replace('background: #e11d48;', 'background: rgba(23, 23, 23, .8);') : PLAYER_CSS;
	const activate = variant === 'no-activation' ? '' : `<script>document.querySelector('[data-markless-embed] .play').addEventListener('click', (e) => { const host = e.currentTarget.closest('[data-markless-embed]'); host.innerHTML = ${JSON.stringify(FRAME(provider).replace('launch-keynote"', 'launch-keynote?autoplay=1"'))}; host.querySelector('iframe').focus(); });</script>`;
	return `<style>${css} .mm-embed { position: relative; display: block; width: 640px; height: 360px; } .mm-embed iframe { display: block; }</style>
<div class="mm-embed" data-markless-embed="bunny-4242-launch-keynote"><div class="mm-player">${PLAYER_BODY}</div></div>${activate}`;
}

function page(provider: string, variant: Variant): string {
	const embed = variant === 'old' || variant === 'kept' ? FRAME(provider) : variant === 'dropped' ? '' : component(provider, variant);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Keynote</title><style>body{margin:0;padding:24px;font:16px/1.5 Arial,sans-serif} main{max-width:700px} @media (prefers-color-scheme: dark){body{background:#111;color:#eee}}</style></head>
<body><main><h1>Watch the keynote</h1><div class="video">${embed}</div><p>It is forty minutes long.</p></main></body></html>`;
}

const listen = (server: Server) => new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

/** The provider on its own origin (localhost, so it is another site to the pages on 127.0.0.1), then one page per variant. */
export async function serveProvider(): Promise<{ origin: string; server: Server }> {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		if (!url.pathname.startsWith('/embed/')) return res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(player(url.searchParams.get('autoplay') === '1'));
	});
	const origin = (await listen(server)).replace('127.0.0.1', 'localhost');
	return { origin, server };
}

export async function serve(variant: Variant, provider: string): Promise<{ origin: string; server: Server }> {
	const server = createServer((req, res) => {
		if ((req.url ?? '/') !== '/') return res.writeHead(404).end();
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(provider, variant));
	});
	return { origin: await listen(server), server };
}
