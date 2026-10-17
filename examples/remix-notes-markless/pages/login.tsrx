import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import LoginForm from '../components/login-form.tsrx';

export default function LoginPage({ url }: PageProps) @{
	const redirectTo = computed(() => new URLSearchParams(url.search).get('redirectTo') || '/notes');
	const joinHref = computed(() => `/join${new URLSearchParams(url.search).toString() ? `?${new URLSearchParams(url.search).toString()}` : ''}`);
	<div class="flex min-h-full flex-col justify-center">
		<div class="mx-auto w-full max-w-md px-8">
			<LoginForm redirectTo={redirectTo} joinHref={joinHref} />
		</div>
	</div>
}
