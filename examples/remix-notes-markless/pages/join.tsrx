import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import JoinForm from '../components/join-form.tsrx';

export default function Join({ url }: PageProps) @{
	const redirectTo = computed(() => new URLSearchParams(url.search).get('redirectTo') ?? undefined);
	const loginHref = computed(() => `/login${new URLSearchParams(url.search).toString() ? `?${new URLSearchParams(url.search).toString()}` : ''}`);
	<div class="flex min-h-full flex-col justify-center">
		<div class="mx-auto w-full max-w-md px-8">
			<JoinForm redirectTo={redirectTo} loginHref={loginHref} />
		</div>
	</div>
}
