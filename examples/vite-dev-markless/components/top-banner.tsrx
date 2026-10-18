import { dismissBanner } from './banner.ts';
import viteMono from '../assets/icons/vite-mono.svg';
import viteFooterBackground from '../assets/vite/footer-background.jpg';

export default function TopBanner() @{
	<div class="top-banner hidden md:block relative w-full overflow-hidden" data-theme="dark" data-v-56d116fe="">
		<a href="https://viteconf.org/" target="_blank" rel="noopener noreferrer" class="group block relative w-full no-underline text-white">
			<img src={viteFooterBackground} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover object-bottom brightness-60" loading="eager" />
			<div class="relative z-10 w-full h-10 flex px-4">
				<div class="flex items-center gap-2 w-full max-w-360 mx-auto px-4">
					<img src={viteMono} alt="Vite icon" class="w-5 h-5 -translate-y-px shrink-0 hidden sm:block drop-shadow-md/70" />
					<span class="text-xs translate-y-px font-medium font-mono leading-snug tracking-wide uppercase whitespace-nowrap overflow-hidden text-ellipsis text-shadow-md/50">ViteConf 2026 - October 15, Online</span>
					<svg class="shrink-0 transition-transform duration-200 group-hover:translate-x-1" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<rect width="20" height="20" rx="4" fill="#08060D"></rect>
						<rect x="0.5" y="0.5" width="19" height="19" rx="3.5" stroke="white" stroke-opacity="0.15"></rect>
						<path d="M10 6L14 10L10 14" stroke="white" stroke-width="1.2" stroke-linejoin="round"></path>
						<path d="M14 10L6 10" stroke="white" stroke-width="1.2" stroke-linejoin="round"></path>
					</svg>
				</div>
			</div>
		</a>
		<button onClick={() => dismissBanner()} aria-label="Close banner" class="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 text-white hover:opacity-70 transition-opacity" type="button">
			<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" class="size-5 cursor-pointer" data-icon="lucide:x"></svg>
		</button>
	</div>
}
