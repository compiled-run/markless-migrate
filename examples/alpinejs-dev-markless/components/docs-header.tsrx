import { computed, element, state } from '@markless/core';
import NavList from './nav-list.tsrx';
import SearchButton from './search-button.tsrx';
import { openTrap, closeTrap, keepFocusInside } from './trap.ts';

export default function DocsHeader({ pathname }: { readonly pathname: string }) @{
	let show = state(false);
	let leaving = state(false);
	const panel = element<HTMLDivElement>();
	const panelClass = computed(() => `fixed top-0 bottom-0 right-0 z-[199] w-1/2 overflow-y-auto bg-gray-100 p-6 shadow-xl md:top-[4rem]${show ? (leaving ? ' menu-leave' : ' menu-enter') : ''}`);

	<header class="bg-white md:fixed md:left-0 md:right-0 md:top-0 md:z-30 md:h-[5rem]">
		<div class="flex items-center justify-between pt-3">
			<div class="py-0 pl-6 text-2xl font-semibold text-gray-800 hover:text-gray-900 md:w-64">
				<a href="/" class="flex items-center">
					<img src="/alpine_long.svg" class="w-[200px] md:w-[290px]" alt="" />
				</a>
			</div>
			<div class="hidden items-center justify-end space-x-6 py-4 pr-6 text-gray-800 md:flex">
				<div>
					<div id="docsearch">
							<SearchButton />
						</div>
				</div>
				<a href="https://github.com/alpinejs/alpine" class="block hover:text-gray-600">
					<svg class="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
						<title>GitHub</title>
						<path d="M10 0a10 10 0 0 0-3.16 19.49c.5.1.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69a3.6 3.6 0 0 1 .1-2.64s.84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.4.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .26.18.58.69.48A10 10 0 0 0 10 0"></path>
					</svg>
				</a>
				<a href="https://twitter.com/Alpine_JS" class="block hover:text-gray-600">
					<svg class="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
						<title>Twitter</title>
						<path d="M6.29 18.25c7.55 0 11.67-6.25 11.67-11.67v-.53c.8-.59 1.49-1.3 2.04-2.13-.75.33-1.54.55-2.36.65a4.12 4.12 0 0 0 1.8-2.27c-.8.48-1.68.81-2.6 1a4.1 4.1 0 0 0-7 3.74 11.65 11.65 0 0 1-8.45-4.3 4.1 4.1 0 0 0 1.27 5.49C2.01 8.2 1.37 8.03.8 7.7v.05a4.1 4.1 0 0 0 3.3 4.03 4.1 4.1 0 0 1-1.86.07 4.1 4.1 0 0 0 3.83 2.85A8.23 8.23 0 0 1 0 16.4a11.62 11.62 0 0 0 6.29 1.84"></path>
					</svg>
				</a>
				<a href="https://alpinejs.codewithhugo.com/chat/" class="block hover:text-gray-600">
					<svg class="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 146 146">
						<title>Discord</title>
						<path d="M107.75 125.001s-4.5-5.375-8.25-10.125c16.375-4.625 22.625-14.875 22.625-14.875-5.125 3.375-10 5.75-14.375 7.375-6.25 2.625-12.25 4.375-18.125 5.375-12 2.25-23 1.625-32.375-.125-7.125-1.375-13.25-3.375-18.375-5.375-2.875-1.125-6-2.5-9.125-4.25-.375-.25-.75-.375-1.125-.625-.25-.125-.375-.25-.5-.375-2.25-1.25-3.5-2.125-3.5-2.125s6 10 21.875 14.75c-3.75 4.75-8.375 10.375-8.375 10.375-27.625-.875-38.125-19-38.125-19 0-40.25 18-72.875 18-72.875 18-13.5 35.125-13.125 35.125-13.125l1.25 1.5c-22.5 6.5-32.875 16.375-32.875 16.375s2.75-1.5 7.375-3.625c13.375-5.875 24-7.5 28.375-7.875.75-.125 1.375-.25 2.125-.25 7.625-1 16.25-1.25 25.25-.25 11.875 1.375 24.625 4.875 37.625 12 0 0-9.875-9.375-31.125-15.875l1.75-2S110 19.626 128 33.126c0 0 18 32.625 18 72.875 0 0-10.625 18.125-38.25 19zM49.625 66.626c-7.125 0-12.75 6.25-12.75 13.875s5.75 13.875 12.75 13.875c7.125 0 12.75-6.25 12.75-13.875.125-7.625-5.625-13.875-12.75-13.875zm45.625 0c-7.125 0-12.75 6.25-12.75 13.875s5.75 13.875 12.75 13.875c7.125 0 12.75-6.25 12.75-13.875s-5.625-13.875-12.75-13.875z" fill-rule="nonzero"></path>
					</svg>
				</a>
			</div>
			<div
				class="flex items-center pr-6 md:hidden"
				attach={(container) => {
					const outside = (event: MouseEvent) => {
						if (!container.contains(event.target as Node) && show && !leaving) {
							leaving = true;
							closeTrap();
						}
					};
					document.addEventListener('click', outside);
					return () => document.removeEventListener('click', outside);
				}}
			>
				<button
					class="text-gray-600 focus:outline-none"
					onClick={() => {
						if (!show) {
							show = true;
							leaving = false;
						} else if (!leaving) {
							leaving = true;
							closeTrap();
						}
					}}
				>
					<span class="sr-only">Show navigation</span>
					<svg class="h-6 w-6 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
						<path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z"></path>
					</svg>
				</button>
				{/* Alpine's x-transition slides the menu in and out; the slide's start is also the first moment the menu can take focus. */}
				<div
					el={panel}
					class={panelClass}
					style={show ? '' : 'display: none;'}
					onAnimationStart={() => {
						if (!leaving) openTrap(panel);
					}}
					onAnimationEnd={() => {
						if (leaving) {
							show = false;
							leaving = false;
						}
					}}
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							event.stopPropagation();
							leaving = true;
							closeTrap();
						}
						if (event.key === 'Tab') keepFocusInside(event, panel);
					}}
				>
					<div class="flex justify-end">
						<button
							class="text-gray-600 focus:outline-none"
							onClick={() => {
								leaving = true;
								closeTrap();
							}}
						>
							<span class="sr-only">Close navigation</span>
							<svg class="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
							</svg>
						</button>
					</div>
					<NavList pathname={pathname} mobile={true} />
				</div>
			</div>
		</div>
	</header>
}
