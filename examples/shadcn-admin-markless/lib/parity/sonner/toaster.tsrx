import { computed } from '@markless/core';
import type { Toast } from './index.ts';

const TOASTER_STYLE = '--width: 356px; --gap: 14px; --normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border); --offset-top: 24px; --offset-right: 24px; --offset-bottom: 24px; --offset-left: 24px; --mobile-offset-top: 16px; --mobile-offset-right: 16px; --mobile-offset-bottom: 16px; --mobile-offset-left: 16px;';

// Three permanent slots instead of a @for: a row created on the client may not carry an attribute bound
// to its item in Markless 0.4.0, so each slot is rendered once and shown or hidden. sonner shows three.
/** sonner's <Toaster duration={5000}>: the labelled live region, and the list of toasts while there are any. */
export function Toaster({ toasts, extra }: { readonly toasts: readonly Toast[]; readonly extra?: boolean }) @{
	// A page's own toaster beside the shell's: sonner has one region, so this one leaves the page while it is empty.
	const toasterGone = computed(() => extra === true && toasts.length === 0);
	const theme = computed(() => (typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
	// sonner mounts its list and toasts only while there are toasts: an empty slot carries none of their inline styles.
	const toasterStyle = computed(() => (toasts.length > 0 ? TOASTER_STYLE : undefined));
	const toast0Shown = computed(() => toasts.length > 0);
	const toast0Type = computed(() => (toasts.length > 0 ? (toasts[0].type === 'default' ? undefined : toasts[0].type) : 'loading'));
	const toast0Title = computed(() => (toasts.length > 0 ? toasts[0].title : ''));
	const toast0Loading = computed(() => (toasts.length > 0 && toasts[0].type === 'loading' ? 'true' : 'false'));
	const toast0Description = computed(() => (toasts.length > 0 ? toasts[0].description ?? '' : ''));
	const toast0NoDescription = computed(() => !(toasts.length > 0 && toasts[0].description));
	const toast0NoIcon = computed(() => toasts.length > 0 && toasts[0].type === 'default');
	const toast0SuccessStyle = computed(() => (toasts.length > 0 ? (toasts[0].type === 'success' ? '' : 'display: none') : undefined));
	const toast0Style = computed(() => (toasts.length > 0 ? '--index: 0; --toasts-before: 0; --z-index: 3; --offset: 0px;' : undefined));
	const toast1Shown = computed(() => toasts.length > 1);
	const toast1Type = computed(() => (toasts.length > 1 ? (toasts[1].type === 'default' ? undefined : toasts[1].type) : 'loading'));
	const toast1Title = computed(() => (toasts.length > 1 ? toasts[1].title : ''));
	const toast1Loading = computed(() => (toasts.length > 1 && toasts[1].type === 'loading' ? 'true' : 'false'));
	const toast1Description = computed(() => (toasts.length > 1 ? toasts[1].description ?? '' : ''));
	const toast1NoDescription = computed(() => !(toasts.length > 1 && toasts[1].description));
	const toast1NoIcon = computed(() => toasts.length > 1 && toasts[1].type === 'default');
	const toast1SuccessStyle = computed(() => (toasts.length > 1 ? (toasts[1].type === 'success' ? '' : 'display: none') : undefined));
	const toast1Style = computed(() => (toasts.length > 1 ? '--index: 1; --toasts-before: 1; --z-index: 2; --offset: 0px;' : undefined));
	const toast2Shown = computed(() => toasts.length > 2);
	const toast2Type = computed(() => (toasts.length > 2 ? (toasts[2].type === 'default' ? undefined : toasts[2].type) : 'loading'));
	const toast2Title = computed(() => (toasts.length > 2 ? toasts[2].title : ''));
	const toast2Loading = computed(() => (toasts.length > 2 && toasts[2].type === 'loading' ? 'true' : 'false'));
	const toast2Description = computed(() => (toasts.length > 2 ? toasts[2].description ?? '' : ''));
	const toast2NoDescription = computed(() => !(toasts.length > 2 && toasts[2].description));
	const toast2NoIcon = computed(() => toasts.length > 2 && toasts[2].type === 'default');
	const toast2SuccessStyle = computed(() => (toasts.length > 2 ? (toasts[2].type === 'success' ? '' : 'display: none') : undefined));
	const toast2Style = computed(() => (toasts.length > 2 ? '--index: 2; --toasts-before: 2; --z-index: 1; --offset: 0px;' : undefined));

	<section hidden={toasterGone} aria-label="Notifications alt+T" tabindex="-1" aria-live="polite" aria-relevant="additions text" aria-atomic="false">
		<ol dir="ltr" tabindex="-1" class="toaster group [&_div[data-content]]:w-full" data-sonner-toaster="true" data-sonner-theme={theme} data-y-position="bottom" data-x-position="right" style={toasterStyle}>
			<li hidden={!toast0Shown} tabindex="0" data-sonner-toast="" data-styled="true" data-mounted="false" data-promise="true" data-swiped="false" data-removed="false" data-visible="true" data-y-position="bottom" data-x-position="right" data-index="0" data-front="true" data-swiping="false" data-dismissible="true" data-type={toast0Type} data-swipe-out="false" data-expanded="false" style={toast0Style}>
				<div data-icon="" hidden={toast0NoIcon}>
					<div class="sonner-loading-wrapper" data-visible={toast0Loading}><div class="sonner-spinner"><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div></div></div>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" style={toast0SuccessStyle}><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
				</div>
				<div data-content="">
					<div data-title="">{toast0Title}</div>
					<div data-description="" hidden={toast0NoDescription}><pre class="mt-2 w-full overflow-x-auto rounded-md bg-slate-950 p-4"><code class="text-white">{toast0Description}</code></pre></div>
				</div>
			</li>
			<li hidden={!toast1Shown} tabindex="0" data-sonner-toast="" data-styled="true" data-mounted="false" data-promise="true" data-swiped="false" data-removed="false" data-visible="true" data-y-position="bottom" data-x-position="right" data-index="1" data-front="false" data-swiping="false" data-dismissible="true" data-type={toast1Type} data-swipe-out="false" data-expanded="false" style={toast1Style}>
				<div data-icon="" hidden={toast1NoIcon}>
					<div class="sonner-loading-wrapper" data-visible={toast1Loading}><div class="sonner-spinner"><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div></div></div>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" style={toast1SuccessStyle}><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
				</div>
				<div data-content="">
					<div data-title="">{toast1Title}</div>
					<div data-description="" hidden={toast1NoDescription}><pre class="mt-2 w-full overflow-x-auto rounded-md bg-slate-950 p-4"><code class="text-white">{toast1Description}</code></pre></div>
				</div>
			</li>
			<li hidden={!toast2Shown} tabindex="0" data-sonner-toast="" data-styled="true" data-mounted="false" data-promise="true" data-swiped="false" data-removed="false" data-visible="true" data-y-position="bottom" data-x-position="right" data-index="2" data-front="false" data-swiping="false" data-dismissible="true" data-type={toast2Type} data-swipe-out="false" data-expanded="false" style={toast2Style}>
				<div data-icon="" hidden={toast2NoIcon}>
					<div class="sonner-loading-wrapper" data-visible={toast2Loading}><div class="sonner-spinner"><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div><div class="sonner-loading-bar"></div></div></div>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" style={toast2SuccessStyle}><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
				</div>
				<div data-content="">
					<div data-title="">{toast2Title}</div>
					<div data-description="" hidden={toast2NoDescription}><pre class="mt-2 w-full overflow-x-auto rounded-md bg-slate-950 p-4"><code class="text-white">{toast2Description}</code></pre></div>
				</div>
			</li>
		</ol>
	</section>
}
