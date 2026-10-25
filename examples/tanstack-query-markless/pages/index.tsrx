import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Shell } from '../components/shell.tsrx';
import { bindRequest } from '../lib/request.ts';
import { here, onServer, storedSandbox } from '../lib/where.ts';

export default function Home({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();

	<Shell url={url} sandbox={sandbox}>
		<div class="p-2">
			<div class="text-lg">Welcome Home!</div>
			<hr class="my-2" />
			<a class="py-1 px-2 text-xs bg-blue-500 text-white rounded-full" href="/dashboard/invoices/3">1 New Invoice</a>
			<hr class="my-2" />
			<div class="max-w-xl">
				As you navigate around take note of the UX. It should feel suspense-like, where routes are only rendered once all of their data and elements are ready.
				<hr class="my-2" />
				To exaggerate async effects, play with the artificial request delay slider in the bottom-left corner.
				<hr class="my-2" />
				The last 2 sliders determine if link-hover preloading is enabled (and how long those preloads stick around) and also whether to cache rendered route data (and for how long). Both of these default to 0 (or off).
			</div>
		</div>
	</Shell>
}
