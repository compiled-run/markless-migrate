import viteFooterBackground from '../assets/vite/footer-background.jpg';

export default function Footer() @{
	<footer class="bg-primary" data-theme="dark">
		<section class="wrapper">
			<div class="relative w-full">
				<img src={viteFooterBackground} alt="Footer background" inert loading="lazy" class="absolute inset-0 w-full h-full object-cover z-0" />
				<div class="relative z-10 w-full sm:w-2xl flex flex-col justify-start items-center gap-5 px-5 sm:px-0 py-10 md:py-30 mx-auto">
					<h2 class="text-center text-white text-balance drop-shadow-sm/70">Start building with Vite</h2>
					<p class="text-white max-w-md text-balance text-center drop-shadow-sm/70">Prepare for a development environment that can finally keep pace with the speed of your mind.</p>
					<a href="/guide/" class="button button--white mt-5">Get Started</a>
				</div>
			</div>
		</section>
		<div>
			<section class="wrapper wrapper--ticks border-t">
				<div class="px-5 md:px-24 pt-10 md:pt-16 pb-16 md:pb-40 flex flex-col md:flex-row gap-10 md:gap-0 md:justify-between">
					<div class="flex flex-col md:flex-row gap-10 md:gap-20">
						<div>
							<p class="text-[var(--vp-c-text-2)] text-xs font-mono uppercase tracking-wide mb-8">Vite</p>
							<ul class="flex flex-col gap-3">
								<li>
									<a href="/guide/" class="text-[var(--vp-c-text-1)] text-base">Guide</a>
								</li>
								<li>
									<a href="/config/" class="text-[var(--vp-c-text-1)] text-base">Config</a>
								</li>
								<li>
									<a href="/plugins/" class="text-[var(--vp-c-text-1)] text-base">Plugins</a>
								</li>
							</ul>
						</div>
						<div>
							<p class="text-[var(--vp-c-text-2)] text-xs font-mono uppercase tracking-wide mb-8">Resources</p>
							<ul class="flex flex-col gap-3">
								<li>
									<a href="/team" class="text-[var(--vp-c-text-1)] text-base">Team</a>
								</li>
								<li>
									<a href="/blog" class="text-[var(--vp-c-text-1)] text-base">Blog</a>
								</li>
								<li>
									<a href="https://github.com/vitejs/vite/releases" class="text-[var(--vp-c-text-1)] text-base">Releases</a>
								</li>
							</ul>
						</div>
						<div>
							<p class="text-[var(--vp-c-text-2)] text-xs font-mono uppercase tracking-wide mb-8">Versions</p>
							<ul class="flex flex-col gap-3">
								<li>
									<a href="https://main.vite.dev" class="text-[var(--vp-c-text-1)] text-base">Unreleased Docs</a>
								</li>
								<li>
									<a href="https://v7.vite.dev" class="text-[var(--vp-c-text-1)] text-base">Vite 7 Docs</a>
								</li>
								<li>
									<a href="https://v6.vite.dev" class="text-[var(--vp-c-text-1)] text-base">Vite 6 Docs</a>
								</li>
								<li>
									<a href="https://v5.vite.dev" class="text-[var(--vp-c-text-1)] text-base">Vite 5 Docs</a>
								</li>
								<li>
									<a href="https://v4.vite.dev" class="text-[var(--vp-c-text-1)] text-base">Vite 4 Docs</a>
								</li>
								<li>
									<a href="https://v3.vite.dev" class="text-[var(--vp-c-text-1)] text-base">Vite 3 Docs</a>
								</li>
								<li>
									<a href="https://v2.vite.dev" class="text-[var(--vp-c-text-1)] text-base">Vite 2 Docs</a>
								</li>
							</ul>
						</div>
					</div>
					<div>
						<p class="text-[var(--vp-c-text-2)] text-xs font-mono uppercase tracking-wide mb-8">Social</p>
						<ul class="flex flex-col gap-3">
							<li>
								<a href="https://github.com/vitejs/vite" class="text-[var(--vp-c-text-1)] text-base flex gap-3 items-center" target="_blank" rel="noopener noreferrer">
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons size-[18px]" aria-label="GitHub">
										<path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path>
									</svg>
									{" GitHub"}
								</a>
							</li>
							<li>
								<a href="https://chat.vite.dev" class="text-[var(--vp-c-text-1)] text-base flex gap-3 items-center" target="_blank" rel="noopener noreferrer">
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons size-[18px]" aria-label="Discord">
										<path fill="currentColor" d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0a13 13 0 0 0-.617-1.25a.08.08 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.1.1 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.08.08 0 0 0 .084-.028a14 14 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13 13 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10 10 0 0 0 .372-.292a.07.07 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01q.181.149.373.292a.077.077 0 0 1-.006.127a12.3 12.3 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028a19.8 19.8 0 0 0 6.002-3.03a.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03M8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418"></path>
									</svg>
									{" Discord"}
								</a>
							</li>
							<li>
								<a href="https://bsky.app/profile/vite.dev" class="text-[var(--vp-c-text-1)] text-base flex gap-3 items-center" target="_blank" rel="noopener noreferrer">
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons size-[18px]" aria-label="Bluesky">
										<path fill="currentColor" d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037c-.856 3.061-3.978 3.842-6.755 3.37c4.854.826 6.089 3.562 3.422 6.299c-5.065 5.196-7.28-1.304-7.847-2.97c-.104-.305-.152-.448-.153-.327c0-.121-.05.022-.153.327c-.568 1.666-2.782 8.166-7.847 2.97c-2.667-2.737-1.432-5.473 3.422-6.3c-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"></path>
									</svg>
									{" Bluesky"}
								</a>
							</li>
							<li>
								<a href="https://x.com/vite_js" class="text-[var(--vp-c-text-1)] text-base flex gap-3 items-center" target="_blank" rel="noopener noreferrer">
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="iconify iconify--simple-icons size-[18px]" aria-label="X.com">
										<path fill="currentColor" d="M14.234 10.162L22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299l-.929-1.329L3.076 1.56h3.182l5.965 8.532l.929 1.329l7.754 11.09h-3.182z"></path>
									</svg>
									{" X.com"}
								</a>
							</li>
						</ul>
					</div>
				</div>
			</section>
			<section class="wrapper wrapper--ticks border-t py-5 px-5 md:px-24 flex flex-col md:flex-row gap-3 md:gap-0 justify-between items-start md:items-center">
				<p class="text-sm">© 2019-present VoidZero Inc. and Vite contributors. (b6c20f6a)</p>
				<div class="gap-10 text-sm hidden md:flex"></div>
			</section>
		</div>
	</footer>
}
