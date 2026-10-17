import AcmeLogo from '../components/acme-logo.tsrx';
import { ArrowRightIcon } from '../components/icons/ArrowRightIcon.tsrx';
import { image } from '../lib/image.ts';

const desktop = image('/hero-desktop.png', 1000);
const mobile = image('/hero-mobile.png', 560);

export default function Page() @{
	<main class="flex min-h-screen flex-col p-6">
		<div class="flex h-20 shrink-0 items-end rounded-lg bg-blue-500 p-4 md:h-52">
			<AcmeLogo />
		</div>
		<div class="mt-4 flex grow flex-col gap-4 md:flex-row">
			<div class="flex flex-col justify-center gap-6 rounded-lg bg-gray-50 px-6 py-10 md:w-2/5 md:px-20">
				<p class="lusitana text-xl text-gray-800 md:text-3xl md:leading-normal">
					<strong>Welcome to Acme.</strong> This is the example for the{' '}
					<a href="https://nextjs.org/learn/" class="text-blue-500">Next.js Learn Course</a>, brought to you by Vercel.
				</p>
				<a href="/login" class="flex items-center gap-5 self-start rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-400 md:text-base">
					<span>Log in</span> <ArrowRightIcon iconClass="w-5 md:w-6" />
				</a>
			</div>
			<div class="flex items-center justify-center p-6 md:w-3/5 md:px-28 md:py-12">
				<img alt="Screenshots of the dashboard project showing desktop version" loading="lazy" width="1000" height="760" decoding="async" class="hidden md:block" style="color:transparent" srcset={desktop.srcset} src={desktop.src} />
				<img alt="Screenshot of the dashboard project showing mobile version" loading="lazy" width="560" height="620" decoding="async" class="block md:hidden" style="color:transparent" srcset={mobile.srcset} src={mobile.src} />
			</div>
		</div>
	</main>
}
