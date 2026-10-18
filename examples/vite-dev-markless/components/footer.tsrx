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
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" class="size-[18px]" aria-label="GitHub" data-icon="simple-icons:github"></svg>
									{" GitHub"}
								</a>
							</li>
							<li>
								<a href="https://chat.vite.dev" class="text-[var(--vp-c-text-1)] text-base flex gap-3 items-center" target="_blank" rel="noopener noreferrer">
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" class="size-[18px]" aria-label="Discord" data-icon="simple-icons:discord"></svg>
									{" Discord"}
								</a>
							</li>
							<li>
								<a href="https://bsky.app/profile/vite.dev" class="text-[var(--vp-c-text-1)] text-base flex gap-3 items-center" target="_blank" rel="noopener noreferrer">
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" class="size-[18px]" aria-label="Bluesky" data-icon="simple-icons:bluesky"></svg>
									{" Bluesky"}
								</a>
							</li>
							<li>
								<a href="https://x.com/vite_js" class="text-[var(--vp-c-text-1)] text-base flex gap-3 items-center" target="_blank" rel="noopener noreferrer">
									<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" style="" width="1em" height="1em" viewBox="0 0 16 16" class="size-[18px]" aria-label="X.com" data-icon="simple-icons:x"></svg>
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
