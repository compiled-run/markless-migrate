import * as rive from '@rive-app/canvas-lite';
import riveWasm from '@rive-app/canvas-lite/rive.wasm?url';
import masthead from '../assets/vite/animations/641_x_629_vite_masthead.riv?url';
import richFeatures from '../assets/vite/animations/563_x_420_rich_features.riv?url';
import flexiblePlugin from '../assets/vite/animations/640_x_300_flexible_plugin.riv?url';

const SOURCES = { masthead, richFeatures, flexiblePlugin };
export type RiveName = keyof typeof SOURCES;

export interface RiveOptions {
	readonly desktopSrc: RiveName;
	readonly mobileSrc?: RiveName;
	readonly desktopWidth?: number;
	readonly desktopHeight?: number;
	readonly mobileWidth?: number;
	readonly mobileHeight?: number;
	readonly breakpoint?: number;
	readonly stateMachines?: string;
}

rive.RuntimeLoader.setWasmUrl(riveWasm);

export function riveAnimation(options: RiveOptions) {
	return (canvas: HTMLCanvasElement) => {
		const container = canvas.parentElement!;
		const breakpoint = options.breakpoint ?? 768;
		let instance: { cleanup(): void; play(): void; resizeDrawingSurfaceToCanvas(): void } | undefined;
		let started = false;
		let mobile = window.innerWidth < breakpoint;
		let disposed = false;

		// Vue patches an attribute only when its bound value changed since the last render, whatever Rive wrote since.
		let bound = { width: options.desktopWidth, height: options.desktopHeight, mobile: false };
		const size = () => {
			const width = mobile && options.mobileWidth ? options.mobileWidth : options.desktopWidth;
			const height = mobile && options.mobileHeight ? options.mobileHeight : options.desktopHeight;
			if (width !== bound.width && width) canvas.width = width;
			if (height !== bound.height && height) canvas.height = height;
			if (mobile !== bound.mobile) container.classList.toggle('pointer-events-none', mobile);
			bound = { width, height, mobile };
		};

		const load = () => {
			if (disposed || instance) return;
			const created: typeof instance = new rive.Rive({
				src: SOURCES[mobile && options.mobileSrc ? options.mobileSrc : options.desktopSrc],
				canvas,
				autoplay: false,
				stateMachines: options.stateMachines ?? 'State Machine 1',
				onLoad: () => created?.resizeDrawingSurfaceToCanvas(),
			});
			instance = created;
			if (started) instance.play();
		};

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && !started) {
					started = true;
					instance?.play();
				}
			},
			{ threshold: 0.1 },
		);
		observer.observe(container);

		// RiveAnimation.vue recreates the animation first; Vue patches the canvas size and class on the next tick.
		const onResize = () => {
			const was = mobile;
			mobile = window.innerWidth < breakpoint;
			if (was === mobile) return;
			instance?.cleanup();
			instance = undefined;
			load();
			void Promise.resolve().then(size);
		};
		window.addEventListener('resize', onResize);

		load();
		void Promise.resolve().then(size);

		return () => {
			disposed = true;
			observer.disconnect();
			window.removeEventListener('resize', onResize);
			instance?.cleanup();
		};
	};
}
