// The old /clerk routes without a publishable key (routes/clerk/route.tsx MissingClerkPubKey), which is what the deployed old app shows.
import { Shell } from '../layout/shell.tsrx';
import type { LayoutPrefs } from '../layout/prefs.ts';

const CODE = 'bg-foreground/10 rounded-sm py-0.5 px-1 text-xs text-foreground font-bold';
const ALERT = 'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current bg-card text-card-foreground';

export function ClerkMissingKey({ active, prefs }: { readonly active: string; readonly prefs: LayoutPrefs }) @{
	<Shell active={active} header="clerk" prefs={prefs}>
		<main data-layout="auto" class="px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl flex flex-col items-center justify-start">
			<div class="max-w-2xl">
				<div data-slot="alert" role="alert" class={ALERT}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-key size-4" aria-hidden="true"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" /><path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" /></svg>
					<div data-slot="alert-title" class="col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight">No Publishable Key Found!</div>
					<div data-slot="alert-description" class="col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed">
						<p class="text-balance">You need to generate a publishable key from Clerk and put it inside the <code class={CODE}>.env</code> file.</p>
					</div>
				</div>
				<h1 class="mt-4 text-2xl font-bold">Set your Clerk API key</h1>
				<div class="mt-4 flex flex-col gap-y-4 text-foreground/75">
					<ol class="list-inside list-decimal space-y-1.5">
						<li>In the <a href="https://go.clerk.com/GttUAaK" target="_blank" class="underline decoration-dashed underline-offset-4 hover:decoration-solid">Clerk<sup><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link inline-block size-4" aria-hidden="true"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg></sup></a> Dashboard, navigate to the API keys page.</li>
						<li>In the <strong>Quick Copy</strong> section, copy your Clerk Publishable Key.</li>
						<li>Rename <code class={CODE}>.env.example</code> to <code class={CODE}>.env</code></li>
						<li>Paste your key into your <code class={CODE}>.env</code> file.</li>
					</ol>
					<p>The final result should resemble the following:</p>
					<div class="@container space-y-2 rounded-md bg-slate-800 px-3 py-3 text-sm text-slate-200">
						<span class="ps-1">.env</span>
						<pre class="overflow-auto overscroll-x-contain rounded bg-slate-950 px-2 py-1 text-xs"><code><span class={'before:text-slate-400 md:before:pe-2 md:before:content-["1."]'}>VITE_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY</span></code></pre>
					</div>
				</div>
				<div data-orientation="horizontal" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px my-4 w-full"></div>
				<div data-slot="alert" role="alert" class={ALERT}>
					<div data-slot="alert-title" class="col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight">Clerk Integration is Optional</div>
					<div data-slot="alert-description" class="col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed">
						<p class="text-balance">The Clerk integration lives entirely inside <code class={CODE}>src/routes/clerk</code>. If you plan to use Clerk as your auth service, you might want to place <code class={CODE}>ClerkProvider</code> at the root route.</p>
						<p>However, if you don't plan to use Clerk, you can safely remove this directory and related dependency_ <code class={CODE}>{'@clerk/react'}</code>.</p>
						<p class="mt-2 text-sm">This setup is modular by design and won't affect the rest of the application.</p>
					</div>
				</div>
			</div>
		</main>
	</Shell>
}
