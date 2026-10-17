import { state } from '@markless/core';
import { copyCode, tabIndex } from './copy-code.ts';
import RiveAnimation from './rive-animation.tsrx';
import voidzeroLight from '../assets/logos/voidzero-light.svg';
export default function Hero() @{
	let active = state(0);

	<div class="wrapper wrapper--ticks grid md:grid-cols-2 w-full border-nickel md:divide-x">
		<div class="flex flex-col p-10 justify-between gap-20 items-center md:items-start">
			<div class="flex flex-col gap-5 items-center md:items-start text-center md:text-left">
				<a class="flex items-center gap-2" href="https://voidzero.dev" target="_blank">
					<span class="text-grey text-xs font-mono uppercase tracking-wide">By</span>
					<img src={voidzeroLight} alt="VoidZero" class="h-2.5" />
				</a>
				<h1 class="text-white text-pretty max-w-[25rem]">The Build Tool for the Web</h1>
				<p class="text-white/70 md:text-lg max-w-[27rem] text-pretty">Vite is a blazing fast frontend build tool powering the next generation of web applications.</p>
				<div class="flex items-center gap-5 mt-8">
					<a href="/guide/" class="button button--primary inline-block w-fit">Get Started</a>
					<a href="https://github.com/vitejs/vite" target="_blank" rel="noopener noreferrer" class="button inline-block w-fit">View on GitHub</a>
				</div>
			</div>
			<div class="vp-doc hidden md:block w-full -mb-[16px]" style="--vp-code-tab-bg:var(--color-slate);--vp-code-block-bg:var(--color-slate);--vp-code-tab-divider:#000;" data-v-d042e6d8="">
				<div class="vp-code-group" onClick={(event: MouseEvent) => copyCode(event.target)} data-v-d042e6d8="">
					<div class="tabs" onChange={(event: Event) => (active = tabIndex(event.target))} data-v-d042e6d8="">
						<input id="tab-hero-0" type="radio" name="code-group-tabs-hero" checked={active === 0} data-v-d042e6d8="" />
						<label for="tab-hero-0" data-v-d042e6d8="">npm</label>
						<input id="tab-hero-1" type="radio" name="code-group-tabs-hero" checked={active === 1} data-v-d042e6d8="" />
						<label for="tab-hero-1" data-v-d042e6d8="">Yarn</label>
						<input id="tab-hero-2" type="radio" name="code-group-tabs-hero" checked={active === 2} data-v-d042e6d8="" />
						<label for="tab-hero-2" data-v-d042e6d8="">pnpm</label>
						<input id="tab-hero-3" type="radio" name="code-group-tabs-hero" checked={active === 3} data-v-d042e6d8="" />
						<label for="tab-hero-3" data-v-d042e6d8="">Bun</label>
						<input id="tab-hero-4" type="radio" name="code-group-tabs-hero" checked={active === 4} data-v-d042e6d8="" />
						<label for="tab-hero-4" data-v-d042e6d8="">Deno</label>
					</div>
					<div class={active === 0 ? 'language-bash active' : 'language-bash'} data-v-d042e6d8="">
						<button class="copy" title="Copy code" data-v-d042e6d8=""></button>
						<span class="lang" data-v-d042e6d8="">bash</span>
						<pre data-v-d042e6d8=""><code data-v-d042e6d8=""><span style="user-select:none;-webkit-user-select:none;" data-v-d042e6d8="">{"$ "}</span><span data-v-d042e6d8="">{"npm create vite@latest"}</span></code></pre>
					</div>
					<div class={active === 1 ? 'language-bash active' : 'language-bash'} data-v-d042e6d8="">
						<button class="copy" title="Copy code" data-v-d042e6d8=""></button>
						<span class="lang" data-v-d042e6d8="">bash</span>
						<pre data-v-d042e6d8=""><code data-v-d042e6d8=""><span style="user-select:none;-webkit-user-select:none;" data-v-d042e6d8="">{"$ "}</span><span data-v-d042e6d8="">{"yarn create vite"}</span></code></pre>
					</div>
					<div class={active === 2 ? 'language-bash active' : 'language-bash'} data-v-d042e6d8="">
						<button class="copy" title="Copy code" data-v-d042e6d8=""></button>
						<span class="lang" data-v-d042e6d8="">bash</span>
						<pre data-v-d042e6d8=""><code data-v-d042e6d8=""><span style="user-select:none;-webkit-user-select:none;" data-v-d042e6d8="">{"$ "}</span><span data-v-d042e6d8="">{"pnpm create vite"}</span></code></pre>
					</div>
					<div class={active === 3 ? 'language-bash active' : 'language-bash'} data-v-d042e6d8="">
						<button class="copy" title="Copy code" data-v-d042e6d8=""></button>
						<span class="lang" data-v-d042e6d8="">bash</span>
						<pre data-v-d042e6d8=""><code data-v-d042e6d8=""><span style="user-select:none;-webkit-user-select:none;" data-v-d042e6d8="">{"$ "}</span><span data-v-d042e6d8="">{"bun create vite"}</span></code></pre>
					</div>
					<div class={active === 4 ? 'language-bash active' : 'language-bash'} data-v-d042e6d8="">
						<button class="copy" title="Copy code" data-v-d042e6d8=""></button>
						<span class="lang" data-v-d042e6d8="">bash</span>
						<pre data-v-d042e6d8=""><code data-v-d042e6d8=""><span style="user-select:none;-webkit-user-select:none;" data-v-d042e6d8="">{"$ "}</span><span data-v-d042e6d8="">{"deno init --npm vite"}</span></code></pre>
					</div>
				</div>
			</div>
		</div>
		<div class="flex flex-col sm:min-h-[30rem]">
			<div class="relative px-10 pb-10 md:pt-10 h-full flex flex-col justify-center overflow-clip">
				<RiveAnimation desktopSrc="masthead" mobileSrc="masthead" desktopWidth={641} desktopHeight={629} mobileWidth={641} mobileHeight={629} canvasClass="w-full" />
			</div>
		</div>
	</div>
}
