// The /live page's client side (the docs' theme/live components): Timer.vue counts down to the start every second;
// TimeoutSwitcher.vue swaps the countdown for VideoIframe.vue, and drops the past events, once the start has passed;
// VideoIframe.vue drives the embedded YouTube player through its postMessage API.
import { onPage } from './site.ts';

const pad = (value: number) => String(value).padStart(2, '0');
function countdown(remaining: number): string {
	if (!remaining) return '00:00:00:00';
	const total = Math.floor(remaining / 1000);
	return `${Math.floor(total / 86400)}:${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

const STATES: Record<number, string> = {
	[-1]: 'unstarted',
	0: 'end',
	1: 'play',
	2: 'pause',
	3: 'buffer',
	5: 'cued',
};
const LENGTH = 39 * 60 + 15;

function video(root: HTMLElement, start: number): void {
	const iframe = root.querySelector('iframe')!;
	const mask = root.querySelector<HTMLElement>('.video-iframe-mask')!;
	const [chat, fullscreen] = root.querySelectorAll<HTMLElement>('.absolute.top-0.right-0 > *');
	const play = root.querySelector<HTMLButtonElement>('button[aria-label="Play video"], button[aria-label="Pause video"]')!;
	let state = 'pause';
	let paused = true;
	let actions = false;
	let hideTimer: number | undefined;
	const elapsed = () => Math.max(0, Math.floor((Date.now() - start) / 1000));
	const swap = (el: HTMLElement | undefined, on: string, off: string, show: boolean) => {
		if (!el) return;
		el.classList.remove(...(show ? off : on).split(' '));
		el.classList.add(...(show ? on : off).split(' '));
	};
	const render = () => {
		swap(mask, 'opacity-100', 'opacity-0 delay-400', state === 'pause');
		const visible = actions || state !== 'play';
		for (const el of [chat, fullscreen, play]) swap(el, 'opacity-100', 'opacity-0 delay-100 pointer-events-none', visible);
		play.setAttribute('aria-label', state === 'play' ? 'Pause video' : 'Play video');
		const icon = play.querySelector('svg')!;
		const shape = icon.querySelector('g, path');
		if (state === 'play' && shape?.localName === 'path')
			shape.outerHTML = '<g data-v-dac1a97d=""><line x1="10" x2="10" y1="15" y2="9" data-v-dac1a97d=""></line><line x1="14" x2="14" y1="15" y2="9" data-v-dac1a97d=""></line></g>';
		else if (state !== 'play' && shape?.localName === 'g')
			shape.outerHTML = '<path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z" data-v-dac1a97d=""></path>';
	};
	const command = (func: string, args: unknown[] = []) => iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
	const setState = (next: string) => {
		const previous = state;
		state = next;
		if (state === 'pause') paused = true;
		if (state === 'play' && paused && previous !== 'play') {
			if (elapsed() <= LENGTH) {
				paused = false;
				command('seekTo', [elapsed(), true]);
			}
		}
		render();
		if (state === 'play' || state === 'pause') play.focus();
	};
	const toggle = () => {
		if (state === 'play') {
			setState('pause');
			command('pauseVideo');
		} else {
			setState('play');
			command('playVideo');
		}
	};
	const show = () => {
		actions = true;
		render();
		clearTimeout(hideTimer);
		hideTimer = window.setTimeout(() => {
			actions = false;
			render();
		}, 2000);
	};
	window.addEventListener('message', (event) => {
		if (!iframe.isConnected || event.source !== iframe.contentWindow) return;
		let data = event.data as unknown;
		if (typeof data === 'string') {
			try {
				data = JSON.parse(data);
			} catch {
				return;
			}
		}
		const message = data as { event?: string; info?: number | { playerState?: number } } | null;
		if (message?.event === 'onStateChange' && typeof message.info === 'number') setState(STATES[message.info] ?? 'pause');
		else if (message?.event === 'infoDelivery' && message.info && typeof message.info === 'object' && typeof message.info.playerState === 'number')
			setState(STATES[message.info.playerState] ?? 'pause');
	});
	iframe.addEventListener('load', () => {
		iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
		command('addEventListener', ['onStateChange']);
		command('getPlayerState');
	});
	const area = mask.parentElement!;
	area.addEventListener('mouseenter', show);
	area.addEventListener('mousemove', show);
	area.addEventListener('touchstart', show);
	area.addEventListener('mouseleave', () => {
		clearTimeout(hideTimer);
		actions = false;
		render();
	});
	for (const el of [chat, fullscreen, play]) el?.addEventListener('focus', show);
	mask.addEventListener('click', toggle);
	play.addEventListener('click', toggle);
	fullscreen?.addEventListener('click', () => (document.fullscreenElement === root ? void document.exitFullscreen() : void root.requestFullscreen()));
	// VideoIframe.vue: in fullscreen the player shows the site header (scoped as its child) and the exit icon.
	const icon = fullscreen?.querySelector('svg');
	const enterIcon = icon?.innerHTML ?? '';
	const exitIcon =
		'<g><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></g>';
	document.addEventListener('fullscreenchange', () => {
		const on = document.fullscreenElement === root;
		fullscreen?.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
		if (icon) icon.innerHTML = on ? exitIcon : enterIcon;
		root.querySelector(':scope > .video-iframe-header')?.remove();
		const header = document.querySelector('[data-v-5773249e].relative.w-full.z-50:has(> template[data-mobile-menu])');
		if (!on || !header) return;
		const copy = header.cloneNode(true) as HTMLElement;
		copy.classList.add('video-iframe-header');
		copy.setAttribute('data-v-dac1a97d', '');
		root.prepend(copy);
	});
	render();
}

onPage(() => {
	const template = document.querySelector<HTMLTemplateElement>('template[data-live-video]');
	if (!template) return;
	const start = new Date(template.dataset.start!).getTime();
	const [hero, timer, events] = [...template.parentElement!.children];
	const clock = timer?.querySelector('h2');
	const tick = () => {
		if (!template.isConnected) return clearInterval(interval);
		if (clock?.isConnected) clock.textContent = countdown(Math.max(0, start - Date.now()));
		if (Date.now() < start || !hero?.isConnected) return;
		const stream = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
		// VideoIframe.vue's iframeSrc: joins the stream where it is now, or from the start once it has ended.
		const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
		const params = new URLSearchParams({
			si: 'hhgR4fwkRw9zQ0yx',
			controls: '0',
			start: elapsed > LENGTH ? '0' : String(elapsed),
			disablekb: '1',
			rel: '0',
			autoplay: '1',
			enablejsapi: '1',
			origin: location.origin,
		});
		stream.querySelector('iframe')!.src = `https://www.youtube-nocookie.com/embed/bmWQqAKLgT4?${params}`;
		hero.before(stream);
		hero.remove();
		timer?.remove();
		events?.remove();
		video(stream, start);
	};
	const interval = window.setInterval(tick, 1000);
	tick();
});
