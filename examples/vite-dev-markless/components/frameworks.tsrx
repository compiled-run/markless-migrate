import viteViteFrameworksMobile from '../assets/vite/vite-frameworks-mobile.png';
import viteViteFrameworks from '../assets/vite/vite-frameworks.png';

export default function Frameworks() @{
	<section class="wrapper wrapper--ticks border-t py-8 sm:py-16 px-5 sm:px-10">
		<img src={viteViteFrameworksMobile} alt="Frameworks powered by Vite" loading="lazy" class="w-full block sm:hidden" />
		<img src={viteViteFrameworks} alt="Frameworks powered by Vite" loading="lazy" class="w-full hidden sm:block" />
	</section>
}
