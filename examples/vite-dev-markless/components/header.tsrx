import { state } from '@markless/core';
import { blurred, crossed, toggled } from './flyout.ts';
import { activateFocusTrap, deactivateFocusTrap, lockBodyScroll, unlockBodyScroll } from './mobile-menu.ts';
import logosViteDark from '../assets/logos/vite-dark.svg';
import logosViteLight from '../assets/logos/vite-light.svg';

export default function Header() @{
	let resources = state(false);
	let version = state(false);
	let extra = state(false);
	let lang = state(false);
	let mobileOpen = state(false);
	let navResources = state(false);
	let navVersion = state(false);
	let languageMenu = state(false);

	<div
		class="relative w-full z-50"
		data-v-56d116fe=""
		data-v-5773249e=""
		onMouseOver={(event: MouseEvent) => {
			const name = crossed(event);
			if (name === 'resources') resources = true;
			else if (name === 'version') version = true;
			else if (name === 'extra') extra = true;
			else if (name === 'lang') lang = true;
		}}
		onMouseOut={(event: MouseEvent) => {
			const name = crossed(event);
			if (name === 'resources') resources = false;
			else if (name === 'version') version = false;
			else if (name === 'extra') extra = false;
			else if (name === 'lang') lang = false;
		}}
		onFocusOut={(event: FocusEvent) => {
			const name = blurred(event);
			if (name === 'resources') resources = false;
			else if (name === 'version') version = false;
			else if (name === 'extra') extra = false;
			else if (name === 'lang') lang = false;
		}}
		onClick={(event: MouseEvent) => {
			const name = toggled(event.target);
			if (name === 'resources') resources = !resources;
			else if (name === 'version') version = !version;
			else if (name === 'extra') extra = !extra;
			else if (name === 'lang') lang = !lang;
			else if (name === 'nav-resources') navResources = !navResources;
			else if (name === 'nav-version') navVersion = !navVersion;
			else if (name === 'language') languageMenu = !languageMenu;
			else if (name === 'menu' && !mobileOpen) {
				mobileOpen = true; lockBodyScroll(); activateFocusTrap();
			} else if (name === 'menu' || name === 'close') {
				mobileOpen = false; navResources = false; navVersion = false; languageMenu = false; unlockBodyScroll(); deactivateFocusTrap();
			}
		}}
		onKeyDown={(event: KeyboardEvent) => {
			if (event.key === 'Escape' && mobileOpen) {
				mobileOpen = false; navResources = false; navVersion = false; languageMenu = false; unlockBodyScroll(); deactivateFocusTrap();
			}
		}}
	>
		<header class="wrapper px-6 py-5 flex items-center justify-between relative bg-white dark:bg-primary border-b border-stroke dark:border-nickel" data-v-5773249e="">
			<div class="flex gap-10 self-stretch" data-v-5773249e="">
				<a href="/" class="flex flex-col items-start justify-center -mx-2 px-2" data-v-5773249e="">
					<img class="h-4 block dark:hidden" src={logosViteDark} alt="Vite" data-v-5773249e="" />
					<img class="h-4 hidden dark:block" src={logosViteLight} alt="Vite" data-v-5773249e="" />
				</a>
				<div class="hidden lg:flex items-center gap-4" data-v-5773249e="">
					<nav aria-labelledby="main-nav-aria-label" class="VPNavBarMenu" data-v-5773249e="" data-v-f4b59cd3="">
						<span id="main-nav-aria-label" class="visually-hidden" data-v-f4b59cd3="">Main Navigation</span>
						<a class="VPLink link flex items-center gap-1 px-3 py-2 text-base font-heading text-primary dark:text-white hover:opacity-85 transition-opacity whitespace-nowrap overflow-hidden text-ellipsis" href="/guide/" tabindex="0" data-v-f4b59cd3="" data-v-fa76074b="">
							<span data-v-fa76074b="">Guide</span>
						</a>
						<a class="VPLink link flex items-center gap-1 px-3 py-2 text-base font-heading text-primary dark:text-white hover:opacity-85 transition-opacity whitespace-nowrap overflow-hidden text-ellipsis" href="/config/" tabindex="0" data-v-f4b59cd3="" data-v-fa76074b="">
							<span data-v-fa76074b="">Config</span>
						</a>
						<a class="VPLink link flex items-center gap-1 px-3 py-2 text-base font-heading text-primary dark:text-white hover:opacity-85 transition-opacity whitespace-nowrap overflow-hidden text-ellipsis" href="/plugins/" tabindex="0" data-v-f4b59cd3="" data-v-fa76074b="">
							<span data-v-fa76074b="">Plugins</span>
						</a>
						<div data-flyout="resources" class="VPFlyout relative flex items-center VPNavBarMenuGroup" data-v-f4b59cd3="" data-v-c3b5d054="">
							<button type="button" class="flex items-center px-3 py-2 text-base font-heading text-primary dark:text-white hover:opacity-70 transition-opacity whitespace-nowrap overflow-hidden text-ellipsis" aria-haspopup="true" aria-expanded={resources ? 'true' : 'false'} data-v-c3b5d054="">
								<span class="flex items-center gap-1 leading-normal overflow-hidden" data-v-c3b5d054="">
									<span class="overflow-hidden text-ellipsis" data-v-c3b5d054="">Resources</span>
									<span class="vpi-chevron-down text-sm shrink-0" data-v-c3b5d054=""></span>
								</span>
							</button>
							<div class="menu" data-v-c3b5d054="">
								<div class="VPMenu rounded-sm p-3 min-w-32 border border-stroke dark:border-nickel bg-white dark:bg-primary shadow-lg max-h-[calc(100vh-var(--vp-nav-height))] overflow-y-auto" data-v-c3b5d054="" data-v-c05e475a="">
									<div class="items" data-v-c05e475a="">
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="/team" data-v-c6088084="">
												<span data-v-c6088084="">Team</span>
											</a>
										</div>
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="/blog" data-v-c6088084="">
												<span data-v-c6088084="">Blog</span>
											</a>
										</div>
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="/releases" data-v-c6088084="">
												<span data-v-c6088084="">Releases</span>
											</a>
										</div>
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="/acknowledgements" data-v-c6088084="">
												<span data-v-c6088084="">Acknowledgements</span>
											</a>
										</div>
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://github.com/vitejs/.github/blob/main/CODE_OF_CONDUCT.md" target="_blank" rel="noreferrer" data-v-c6088084="">
												<span data-v-c6088084="">Code of Conduct</span>
											</a>
										</div>
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://registry.vite.dev/plugins" target="_blank" rel="noreferrer" data-v-c6088084="">
												<span data-v-c6088084="">Plugin Registry</span>
											</a>
										</div>
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://www.youtube.com/watch?v=bmWQqAKLgT4" target="_blank" rel="noreferrer" data-v-c6088084="">
												<span data-v-c6088084="">The Documentary</span>
											</a>
										</div>
										<div class="VPMenuGroup" data-v-c05e475a="" data-v-8e889628="">
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://bsky.app/profile/vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Bluesky</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://elk.zone/m.webtoo.ls/@vite" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Mastodon</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://x.com/vite_js" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">X</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://chat.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Discord Chat</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://github.com/vitejs/awesome-vite" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Awesome Vite</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://viteconf.org" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">ViteConf</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://dev.to/t/vite" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">DEV Community</span>
												</a>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
						<div data-flyout="version" class="VPFlyout relative flex items-center VPNavBarMenuGroup" data-v-f4b59cd3="" data-v-c3b5d054="">
							<button type="button" class="flex items-center px-3 py-2 text-base font-heading text-primary dark:text-white hover:opacity-70 transition-opacity whitespace-nowrap overflow-hidden text-ellipsis" aria-haspopup="true" aria-expanded={version ? 'true' : 'false'} data-v-c3b5d054="">
								<span class="flex items-center gap-1 leading-normal overflow-hidden" data-v-c3b5d054="">
									<span class="overflow-hidden text-ellipsis" data-v-c3b5d054="">v8.3.4</span>
									<span class="vpi-chevron-down text-sm shrink-0" data-v-c3b5d054=""></span>
								</span>
							</button>
							<div class="menu" data-v-c3b5d054="">
								<div class="VPMenu rounded-sm p-3 min-w-32 border border-stroke dark:border-nickel bg-white dark:bg-primary shadow-lg max-h-[calc(100vh-var(--vp-nav-height))] overflow-y-auto" data-v-c3b5d054="" data-v-c05e475a="">
									<div class="items" data-v-c05e475a="">
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md" target="_blank" rel="noreferrer" data-v-c6088084="">
												<span data-v-c6088084="">Changelog</span>
											</a>
										</div>
										<div class="VPMenuLink" data-v-c05e475a="" data-v-c6088084="">
											<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://github.com/vitejs/vite/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer" data-v-c6088084="">
												<span data-v-c6088084="">Contributing</span>
											</a>
										</div>
										<div class="VPMenuGroup" data-v-c05e475a="" data-v-8e889628="">
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://main.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Unreleased Docs</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://v7.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Vite 7 Docs</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://v6.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Vite 6 Docs</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://v5.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Vite 5 Docs</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://v4.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Vite 4 Docs</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://v3.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Vite 3 Docs</span>
												</a>
											</div>
											<div class="VPMenuLink" data-v-8e889628="" data-v-c6088084="">
												<a class="VPLink link vp-external-link-icon flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://v2.vite.dev" target="_blank" rel="noreferrer" data-v-c6088084="">
													<span data-v-c6088084="">Vite 2 Docs</span>
												</a>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</nav>
				</div>
			</div>
			<div class="flex items-center gap-2 lg:gap-4" data-v-5773249e="">
				<div class="hidden lg:flex items-center" data-v-5773249e="">
					<div class="VPNavBarSearch" data-v-5773249e="" data-v-e251291c="">
						<button type="button" class="VPNavBarSearchButton" aria-label="Search" aria-keyshortcuts="/ control+k meta+k" data-v-e251291c="" data-v-86805374="">
							<span class="vpi-search" aria-hidden="true" data-v-86805374=""></span>
							<span class="text" data-v-86805374="">Search</span>
							<span class="keys" aria-hidden="true" data-v-86805374="">
								<kbd class="key-cmd" data-v-86805374="">⌘</kbd>
								<kbd class="key-ctrl" data-v-86805374="">Ctrl</kbd>
								<kbd data-v-86805374="">K</kbd>
							</span>
						</button>
					</div>
				</div>
				<div class="hidden lg:flex xl:hidden items-center gap-4" data-v-5773249e="">
					<div data-flyout="extra" class="VPFlyout relative flex items-center VPNavBarExtra" data-v-5773249e="" data-v-942b3058="" data-v-c3b5d054="">
						<button type="button" class="flex items-center px-3 py-2 text-base font-heading text-primary dark:text-white hover:opacity-70 transition-opacity whitespace-nowrap overflow-hidden text-ellipsis" aria-haspopup="true" aria-expanded={extra ? 'true' : 'false'} aria-label="extra navigation" data-v-c3b5d054="">
							<span class="vpi-more-horizontal text-xl" data-v-c3b5d054=""></span>
						</button>
						<div class="menu" data-v-c3b5d054="">
							<div class="VPMenu rounded-sm p-3 min-w-32 border border-stroke dark:border-nickel bg-white dark:bg-primary shadow-lg max-h-[calc(100vh-var(--vp-nav-height))] overflow-y-auto" data-v-c3b5d054="" data-v-c05e475a="">
								<div class="group translations" data-v-942b3058="">
									<p class="trans-title" data-v-942b3058="">English</p>
									<div class="VPMenuLink" data-v-942b3058="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://cn.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">简体中文</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-942b3058="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://ja.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">日本語</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-942b3058="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://es.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">Español</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-942b3058="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://ko.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">한국어</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-942b3058="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://de.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">Deutsch</span>
										</a>
									</div>
								</div>
								<div class="group" data-v-942b3058="">
									<div class="item social-links" data-v-942b3058="">
										<div class="VPSocialLinks social-links-list" data-v-942b3058="" data-v-e0afa56d="">
											<a class="VPSocialLink no-icon" href="https://bsky.app/profile/vite.dev" aria-label="bluesky" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
												<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:bluesky"></svg>
											</a>
											<a class="VPSocialLink no-icon" href="https://elk.zone/m.webtoo.ls/@vite" aria-label="mastodon" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
												<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:mastodon"></svg>
											</a>
											<a class="VPSocialLink no-icon" href="https://x.com/vite_js" aria-label="x" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
												<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:x"></svg>
											</a>
											<a class="VPSocialLink no-icon" href="https://chat.vite.dev" aria-label="discord" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
												<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:discord"></svg>
											</a>
											<a class="VPSocialLink no-icon" href="https://github.com/vitejs/vite" aria-label="github" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
												<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:github"></svg>
											</a>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div class="hidden xl:flex items-center gap-4" data-v-5773249e="">
					<div data-flyout="lang" class="VPFlyout relative flex items-center VPNavBarTranslations" data-v-5773249e="" data-v-3f10cd70="" data-v-c3b5d054="">
						<button type="button" class="flex items-center px-3 py-2 text-base font-heading text-primary dark:text-white hover:opacity-70 transition-opacity whitespace-nowrap overflow-hidden text-ellipsis" aria-haspopup="true" aria-expanded={lang ? 'true' : 'false'} aria-label="Change language" data-v-c3b5d054="">
							<span class="flex items-center gap-1 leading-normal overflow-hidden" data-v-c3b5d054="">
								<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" class="shrink-0 mr-0.5" data-v-c3b5d054="" data-icon="lucide:languages"></svg>
								<span class="vpi-chevron-down text-sm shrink-0" data-v-c3b5d054=""></span>
							</span>
						</button>
						<div class="menu" data-v-c3b5d054="">
							<div class="VPMenu rounded-sm p-3 min-w-32 border border-stroke dark:border-nickel bg-white dark:bg-primary shadow-lg max-h-[calc(100vh-var(--vp-nav-height))] overflow-y-auto" data-v-c3b5d054="" data-v-c05e475a="">
								<div class="items" data-v-3f10cd70="">
									<p class="title" data-v-3f10cd70="">English</p>
									<div class="VPMenuLink" data-v-3f10cd70="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://cn.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">简体中文</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-3f10cd70="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://ja.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">日本語</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-3f10cd70="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://es.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">Español</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-3f10cd70="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://ko.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">한국어</span>
										</a>
									</div>
									<div class="VPMenuLink" data-v-3f10cd70="" data-v-c6088084="">
										<a class="VPLink link flex items-center justify-between rounded-md px-3 py-2 text-sm font-heading text-primary dark:text-white text-left whitespace-nowrap hover:opacity-70 transition-opacity" href="https://de.vite.dev/" rel="alternate" data-v-c6088084="">
											<span data-v-c6088084="">Deutsch</span>
										</a>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="VPSocialLinks VPNavBarSocialLinks" data-v-5773249e="" data-v-53944563="" data-v-e0afa56d="">
						<a class="VPSocialLink no-icon" href="https://bsky.app/profile/vite.dev" aria-label="bluesky" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
							<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:bluesky"></svg>
						</a>
						<a class="VPSocialLink no-icon" href="https://elk.zone/m.webtoo.ls/@vite" aria-label="mastodon" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
							<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:mastodon"></svg>
						</a>
						<a class="VPSocialLink no-icon" href="https://x.com/vite_js" aria-label="x" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
							<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:x"></svg>
						</a>
						<a class="VPSocialLink no-icon" href="https://chat.vite.dev" aria-label="discord" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
							<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:discord"></svg>
						</a>
						<a class="VPSocialLink no-icon" href="https://github.com/vitejs/vite" aria-label="github" target="_blank" rel="me noopener" data-v-e0afa56d="" data-v-88df0d88="">
							<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" data-v-88df0d88="" data-icon="simple-icons:github"></svg>
						</a>
					</div>
				</div>
				<button aria-label="Search" class="lg:hidden p-2 text-primary dark:text-white hover:opacity-70 transition-opacity cursor-pointer" type="button" data-v-5773249e="">
					<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" class="size-5" data-v-5773249e="" data-icon="lucide:search"></svg>
				</button>
				<button aria-expanded={mobileOpen ? 'true' : 'false'} aria-controls="mobile-menu" aria-label="Toggle navigation menu" class="lg:hidden p-2 -mr-2 text-primary dark:text-white hover:opacity-70 transition-opacity cursor-pointer" type="button" data-v-5773249e="" data-toggle="menu">
					@if (!mobileOpen) {
						<svg class="size-6 block dark:hidden" viewBox="0 0 18 8" xmlns="http://www.w3.org/2000/svg" data-v-5773249e="">
							<path d="M0 0.75H18" stroke="#08060D" stroke-width="1.5" data-v-5773249e=""></path>
							<path d="M0 6.75H18" stroke="#08060D" stroke-width="1.5" data-v-5773249e=""></path>
						</svg>;
						<svg class="size-6 hidden dark:block" viewBox="0 0 18 8" xmlns="http://www.w3.org/2000/svg" data-v-5773249e="">
							<path d="M0 0.75H18" stroke="#FFFFFF" stroke-width="1.5" data-v-5773249e=""></path>
							<path d="M0 6.75H18" stroke="#FFFFFF" stroke-width="1.5" data-v-5773249e=""></path>
						</svg>;
					}
				</button>
			</div>
		</header>
		<div class="wrapper relative h-0 tick-left tick-right" data-v-5773249e=""></div>
			<div data-v-5773249e="" id="mobile-menu" hidden={!mobileOpen} role="dialog" aria-modal="true" aria-label="Mobile navigation menu" data-theme="dark" class="lg:hidden fixed inset-0 z-[1001] bg-white dark:bg-primary">
				<section data-v-5773249e="" class="wrapper animate-fade-in">
					<div data-v-5773249e="" class="w-full pl-5 pr-5 py-5 lg:py-7 flex items-center justify-between">
						<a data-v-5773249e="" href="/">
							@if (mobileOpen) {
								<img data-v-5773249e="" class="h-4 block dark:hidden" src="/vite-dark.svg" alt="Vite" />;
								<img data-v-5773249e="" class="h-4 hidden dark:block" src="/vite-light.svg" alt="Vite" />;
							}
						</a>
						<div data-v-5773249e="" class="flex items-center gap-2">
							<button data-v-5773249e="" aria-label="Search" class="p-2 text-primary dark:text-white hover:opacity-70 transition-opacity cursor-pointer" type="button">
								<svg data-v-5773249e="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--lucide size-5">
									<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
										<path d="m21 21l-4.34-4.34"></path>
										<circle cx="11" cy="11" r="8"></circle>
									</g>
								</svg>
							</button>
							<button data-v-5773249e="" data-toggle="close" aria-label="Close navigation menu" class="p-2 -mr-2 text-primary dark:text-white hover:opacity-70 transition-opacity" type="button">
								<svg data-v-5773249e="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--lucide size-6 cursor-pointer">
									<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"></path>
								</svg>
							</button>
						</div>
					</div>
					<div data-v-5773249e="" class="overflow-y-auto flex flex-col [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" style="height: calc(100vh - 88px);">
						<nav data-v-5773249e="" class="flex-1 w-full pt-6 pb-8">
							<ul data-v-5773249e="" class="space-y-1">
								<li data-v-5773249e="">
									<a data-v-5773249e="" href="/guide/" class="block py-3 px-4 text-base font-sans text-primary dark:text-white">Guide</a>
								</li>
								<li data-v-5773249e="">
									<a data-v-5773249e="" href="/config/" class="block py-3 px-4 text-base font-sans text-primary dark:text-white">Config</a>
								</li>
								<li data-v-5773249e="">
									<a data-v-5773249e="" href="/plugins/" class="block py-3 px-4 text-base font-sans text-primary dark:text-white">Plugins</a>
								</li>
								<li data-v-5773249e="">
									<button data-v-5773249e="" class="w-full flex items-center justify-between py-3 px-4 text-base font-sans text-primary dark:text-white" data-toggle="nav-resources" aria-expanded={navResources ? 'true' : 'false'}>
										<span data-v-5773249e="">Resources</span>
										<svg data-v-5773249e="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class={navResources ? 'iconify iconify--lucide size-4 transition-transform duration-200 rotate-180' : 'iconify iconify--lucide size-4 transition-transform duration-200'}>
											<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6"></path>
										</svg>
									</button>
									<ul data-v-5773249e="" class="pl-4 space-y-1" style={navResources ? '' : 'display: none;'}>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="/team" class="block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Team</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="/blog" class="block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Blog</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="/releases" class="block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Releases</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="/acknowledgements" class="block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Acknowledgements</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://github.com/vitejs/.github/blob/main/CODE_OF_CONDUCT.md" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Code of Conduct</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://registry.vite.dev/plugins" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Plugin Registry</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://www.youtube.com/watch?v=bmWQqAKLgT4" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">The Documentary</a>
										</li>
										<li data-v-5773249e="">
											<ul data-v-5773249e="" class="pl-4 space-y-1">
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://bsky.app/profile/vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Bluesky</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://elk.zone/m.webtoo.ls/@vite" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Mastodon</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://x.com/vite_js" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">X</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://chat.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Discord Chat</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://github.com/vitejs/awesome-vite" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Awesome Vite</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://viteconf.org" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">ViteConf</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://dev.to/t/vite" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">DEV Community</a>
												</li>
											</ul>
										</li>
									</ul>
								</li>
								<li data-v-5773249e="">
									<button data-v-5773249e="" class="w-full flex items-center justify-between py-3 px-4 text-base font-sans text-primary dark:text-white" data-toggle="nav-version" aria-expanded={navVersion ? 'true' : 'false'}>
										<span data-v-5773249e="">v8.3.4</span>
										<svg data-v-5773249e="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class={navVersion ? 'iconify iconify--lucide size-4 transition-transform duration-200 rotate-180' : 'iconify iconify--lucide size-4 transition-transform duration-200'}>
											<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6"></path>
										</svg>
									</button>
									<ul data-v-5773249e="" class="pl-4 space-y-1" style={navVersion ? '' : 'display: none;'}>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Changelog</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://github.com/vitejs/vite/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Contributing</a>
										</li>
										<li data-v-5773249e="">
											<ul data-v-5773249e="" class="pl-4 space-y-1">
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://main.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Unreleased Docs</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://v7.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Vite 7 Docs</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://v6.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Vite 6 Docs</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://v5.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Vite 5 Docs</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://v4.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Vite 4 Docs</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://v3.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Vite 3 Docs</a>
												</li>
												<li data-v-5773249e="">
													<a data-v-5773249e="" href="https://v2.vite.dev" target="_blank" rel="noreferrer" class="vp-external-link-icon block py-1.5 px-4 text-sm font-sans text-grey dark:text-white/80 hover:text-primary dark:hover:text-white">Vite 2 Docs</a>
												</li>
											</ul>
										</li>
									</ul>
								</li>
							</ul>
						</nav>
						<div data-v-5773249e="" class="w-full pt-6 pb-12 border-t border-stroke dark:border-nickel relative tick-left tick-right mt-auto">
							<div data-v-5773249e="" class="space-y-6">
								<div data-v-5773249e="" class="px-4">
									<button data-v-5773249e="" class="w-full flex items-center justify-between text-grey dark:text-white/80 text-sm font-medium" data-toggle="language" aria-expanded={languageMenu ? 'true' : 'false'}>
										<span data-v-5773249e="">Language</span>
										<svg data-v-5773249e="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class={languageMenu ? 'iconify iconify--lucide size-4 transition-transform duration-200 rotate-180' : 'iconify iconify--lucide size-4 transition-transform duration-200'}>
											<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6"></path>
										</svg>
									</button>
									<ul data-v-5773249e="" class="mt-3 space-y-1" style={languageMenu ? '' : 'display: none;'}>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://cn.vite.dev/" class="block py-2 text-sm text-primary dark:text-white hover:opacity-70 transition-opacity">简体中文</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://ja.vite.dev/" class="block py-2 text-sm text-primary dark:text-white hover:opacity-70 transition-opacity">日本語</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://es.vite.dev/" class="block py-2 text-sm text-primary dark:text-white hover:opacity-70 transition-opacity">Español</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://ko.vite.dev/" class="block py-2 text-sm text-primary dark:text-white hover:opacity-70 transition-opacity">한국어</a>
										</li>
										<li data-v-5773249e="">
											<a data-v-5773249e="" href="https://de.vite.dev/" class="block py-2 text-sm text-primary dark:text-white hover:opacity-70 transition-opacity">Deutsch</a>
										</li>
									</ul>
								</div>
								<div data-v-5773249e="" class="flex items-center justify-center gap-4 pt-4">
									<div data-v-e0afa56d="" data-v-5773249e="" class="VPSocialLinks">
										<a data-v-88df0d88="" data-v-e0afa56d="" class="VPSocialLink no-icon" href="https://bsky.app/profile/vite.dev" aria-label="bluesky" target="_blank" rel="me noopener">
											<svg data-v-88df0d88="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons">
												<path fill="currentColor" d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037c-.856 3.061-3.978 3.842-6.755 3.37c4.854.826 6.089 3.562 3.422 6.299c-5.065 5.196-7.28-1.304-7.847-2.97c-.104-.305-.152-.448-.153-.327c0-.121-.05.022-.153.327c-.568 1.666-2.782 8.166-7.847 2.97c-2.667-2.737-1.432-5.473 3.422-6.3c-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"></path>
											</svg>
										</a>
										<a data-v-88df0d88="" data-v-e0afa56d="" class="VPSocialLink no-icon" href="https://elk.zone/m.webtoo.ls/@vite" aria-label="mastodon" target="_blank" rel="me noopener">
											<svg data-v-88df0d88="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons">
												<path fill="currentColor" d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127C.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611c.118 1.24.325 2.47.62 3.68c.55 2.237 2.777 4.098 4.96 4.857c2.336.792 4.849.923 7.256.38q.398-.092.786-.213c.585-.184 1.27-.39 1.774-.753a.06.06 0 0 0 .023-.043v-1.809a.05.05 0 0 0-.02-.041a.05.05 0 0 0-.046-.01a20.3 20.3 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.6 5.6 0 0 1-.319-1.433a.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546c.376 0 .75 0 1.125-.01c1.57-.044 3.224-.124 4.768-.422q.059-.011.11-.024c2.435-.464 4.753-1.92 4.989-5.604c.008-.145.03-1.52.03-1.67c.002-.512.167-3.63-.024-5.545m-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976c-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35c-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102q0-1.965 1.011-3.12c.696-.77 1.608-1.164 2.74-1.164c1.311 0 2.302.5 2.962 1.498l.638 1.06l.638-1.06c.66-.999 1.65-1.498 2.96-1.498c1.13 0 2.043.395 2.74 1.164q1.012 1.155 1.012 3.12z"></path>
											</svg>
										</a>
										<a data-v-88df0d88="" data-v-e0afa56d="" class="VPSocialLink no-icon" href="https://x.com/vite_js" aria-label="x" target="_blank" rel="me noopener">
											<svg data-v-88df0d88="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons">
												<path fill="currentColor" d="M14.234 10.162L22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299l-.929-1.329L3.076 1.56h3.182l5.965 8.532l.929 1.329l7.754 11.09h-3.182z"></path>
											</svg>
										</a>
										<a data-v-88df0d88="" data-v-e0afa56d="" class="VPSocialLink no-icon" href="https://chat.vite.dev" aria-label="discord" target="_blank" rel="me noopener">
											<svg data-v-88df0d88="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons">
												<path fill="currentColor" d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0a13 13 0 0 0-.617-1.25a.08.08 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.1.1 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.08.08 0 0 0 .084-.028a14 14 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13 13 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10 10 0 0 0 .372-.292a.07.07 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01q.181.149.373.292a.077.077 0 0 1-.006.127a12.3 12.3 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028a19.8 19.8 0 0 0 6.002-3.03a.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03M8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418"></path>
											</svg>
										</a>
										<a data-v-88df0d88="" data-v-e0afa56d="" class="VPSocialLink no-icon" href="https://github.com/vitejs/vite" aria-label="github" target="_blank" rel="me noopener">
											<svg data-v-88df0d88="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons">
												<path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path>
											</svg>
										</a>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>
			</div>
	</div>
}
