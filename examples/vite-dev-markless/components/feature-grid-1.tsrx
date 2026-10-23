import RiveAnimation from './rive-animation.tsrx';
import viteViteFeaturepanel4Background640 from '../assets/vite/vite-featurepanel-4-background-640w.webp';
import viteViteFeaturepanel4Background828 from '../assets/vite/vite-featurepanel-4-background-828w.webp';
import viteViteFeaturepanel1Background640 from '../assets/vite/vite-featurepanel-1-background-640w.webp';
import viteViteFeaturepanel1Background828 from '../assets/vite/vite-featurepanel-1-background-828w.webp';
import viteViteFeaturepanel2Terminal640 from '../assets/vite/vite-featurepanel-2-terminal-640w.webp';
import viteViteFeaturepanel2Terminal828 from '../assets/vite/vite-featurepanel-2-terminal-828w.webp';
import viteViteFeaturepanel1Background from '../assets/vite/vite-featurepanel-1-background.jpg';
import viteViteFeaturepanel1Terminal from '../assets/vite/vite-featurepanel-1-terminal.svg';
import viteViteFeaturepanel2Terminal from '../assets/vite/vite-featurepanel-2-terminal.png';
import viteViteFeaturepanel4Background from '../assets/vite/vite-featurepanel-4-background.jpg';
import viteViteFeaturepanel4Terminal from '../assets/vite/vite-featurepanel-4-terminal.svg';

export default function FeatureGrid1() @{
	<section class="wrapper wrapper--ticks border-t grid lg:grid-cols-2 divide-x divide-y divide-nickel">
		<div class="flex flex-col gap-3 justify-between">
			<div class="p-5 sm:p-10 flex flex-col gap-3">
				<h5 class="text-balance sm:text-pretty text-white">Instant Server Start</h5>
				<p class="sm:max-w-[28rem] text-pretty">On demand source file serving over native ESM, with blazing fast dependency pre-bundling.</p>
			</div>
			<div class="relative p-10 sm:p-15 flex justify-center bg-[#370a7f]">
				<img class="absolute inset-0 h-full w-full object-cover" src={viteViteFeaturepanel1Background} srcset={`${viteViteFeaturepanel1Background640} 640w, ${viteViteFeaturepanel1Background828} 828w, ${viteViteFeaturepanel1Background} 1126w`} sizes="(max-width: 767px) 100vw, 734px" alt="" inert loading="lazy" />
				<img class="z-1" src={viteViteFeaturepanel1Terminal} width="493" height="230" alt="Terminal" inert loading="lazy" />
			</div>
		</div>
		<div class="flex flex-col gap-3 justify-between border-r-0">
			<div class="p-5 sm:p-10 flex flex-col gap-3">
				<h5 class="text-white">Lightning Fast HMR</h5>
				<p class="max-w-[26rem] text-pretty">Instantly reflect changes as you save, no matter how big your app is.</p>
			</div>
			<div class="flex justify-end">
				<img src={viteViteFeaturepanel2Terminal} srcset={`${viteViteFeaturepanel2Terminal640} 640w, ${viteViteFeaturepanel2Terminal828} 828w, ${viteViteFeaturepanel2Terminal} 1126w`} sizes="(max-width: 767px) 100vw, 587px" width="1126" height="734" class="md:max-w-[80%]" inert loading="lazy" alt="lightning fast hot module replacement" />
			</div>
		</div>
		<div class="p-5 sm:p-10 pb-0 sm:pb-0 flex flex-col gap-3 lg:border-b-0">
			<h5 class="text-white">Rich Features Out of the Box</h5>
			<p class="sm:max-w-[28rem] text-pretty">TypeScript, JSX, CSS, Workers, WebAssembly... and more just a plugin away.</p>
			<RiveAnimation desktopSrc="richFeatures" mobileSrc="richFeatures" desktopWidth={563} desktopHeight={300} mobileWidth={563} mobileHeight={420} canvasClass="w-full" />
		</div>
		<div class="flex flex-col gap-3 justify-between border-r-0 border-b-0">
			<div class="p-5 sm:p-10 flex flex-col gap-3">
				<h5 class="text-white">Optimized Build</h5>
				<p class="max-w-[25rem] text-pretty">Advanced tree-shaking, built-in minification, fine-grained chunking control powered by Rolldown.</p>
			</div>
			<div class="relative p-10 sm:p-15 flex justify-center bg-[#370a7f]">
				<img class="absolute inset-0 h-full w-full object-cover" src={viteViteFeaturepanel4Background} srcset={`${viteViteFeaturepanel4Background640} 640w, ${viteViteFeaturepanel4Background828} 828w, ${viteViteFeaturepanel4Background} 1126w`} sizes="(max-width: 767px) 100vw, 734px" alt="" inert loading="lazy" />
				<img class="z-1" src={viteViteFeaturepanel4Terminal} width="436" height="209" inert loading="lazy" alt="optimized build" />
			</div>
		</div>
	</section>
}
