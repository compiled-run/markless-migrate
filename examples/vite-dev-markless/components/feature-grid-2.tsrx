import RiveAnimation from './rive-animation.tsrx';
import viteViteSsrSupportWebp from '../assets/vite/vite-ssr-support.webp';
import viteViteFeaturepanel4Background640 from '../assets/vite/vite-featurepanel-4-background-640w.webp';
import viteViteFeaturepanel4Background828 from '../assets/vite/vite-featurepanel-4-background-828w.webp';
import viteViteFeaturepanel4Background from '../assets/vite/vite-featurepanel-4-background.jpg';
import viteViteTypedApi from '../assets/vite/vite-typed-api.svg';
import viteViteSsrSupport from '../assets/vite/vite-ssr-support.png';
import viteViteCi from '../assets/vite/vite-ci.svg';

export default function FeatureGrid2() @{
	<section class="wrapper wrapper--ticks border-t grid lg:grid-cols-2 divide-x divide-y divide-nickel">
		<div class="p-5 sm:p-10 flex flex-col gap-3">
			<h5 class="text-balance sm:text-pretty text-white">Flexible Plugin System</h5>
			<p class="sm:max-w-[28rem] text-pretty">Vite plugins extends Rollup's well-designed plugin interface with a few extra Vite-specific options.</p>
			<RiveAnimation desktopSrc="flexiblePlugin" mobileSrc="flexiblePlugin" desktopWidth={640} desktopHeight={300} mobileWidth={640} mobileHeight={300} canvasClass="w-[calc(100%_+_2.5rem)] mt-5 -mx-5" />
		</div>
		<div class="flex flex-col gap-3 border-r-0 justify-between">
			<div class="p-5 sm:p-10 flex flex-col gap-3">
				<h5 class="text-white">Fully Typed API</h5>
				<p class="max-w-[26rem] text-pretty">Designed to be built on top of.</p>
			</div>
			<div class="relative p-5 sm:p-10 flex justify-center bg-[#370a7f]">
				<img class="absolute inset-0 h-full w-full object-cover" src={viteViteFeaturepanel4Background} srcset={`${viteViteFeaturepanel4Background640} 640w, ${viteViteFeaturepanel4Background828} 828w, ${viteViteFeaturepanel4Background} 1126w`} sizes="(max-width: 767px) 100vw, 734px" alt="" inert loading="lazy" />
				<img class="z-1" src={viteViteTypedApi} width="454" height="252" inert loading="lazy" alt="typed api" />
			</div>
		</div>
		<div class="p-5 sm:p-10 flex flex-col gap-3 lg:border-b-0">
			<h5 class="text-white">First class SSR Support</h5>
			<p class="sm:max-w-[28rem] text-pretty mb-12 sm:mb-16">It's never been easier to setup custom SSR (Server-Side Rendering), or build your own SSR framework.</p>
			<img src={viteViteSsrSupport} srcset={`${viteViteSsrSupportWebp} 1x`} width="1008" height="466" alt="SSR Support" loading="lazy" class="w-full px-5" />
		</div>
		<div class="flex flex-col gap-3 justify-between">
			<div class="p-5 sm:p-10 flex flex-col gap-3">
				<h5 class="text-white">Continuous ecosystem integration</h5>
				<p class="max-w-[25rem] text-pretty">Our CI continuously tests Vite changes against downstream projects, allowing us to improve Vite with stability and confidence.</p>
			</div>
			<div class="px-5 sm:px-10 flex justify-center">
				<img src={viteViteCi} width="476" height="272" inert loading="lazy" alt="continuous ecosystem integration" />
			</div>
		</div>
	</section>
}
