import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import AcmeLogo from '../components/acme-logo.tsrx';
import LoginForm from '../components/login-form.tsrx';

export default function LoginPage({ url }: PageProps) @{
	const callbackUrl = computed(() => new URLSearchParams(url.search).get('callbackUrl') || '/dashboard');
	<main class="flex items-center justify-center md:h-screen">
		<div class="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
			<div class="flex h-20 w-full items-end rounded-lg bg-blue-500 p-3 md:h-36">
				<div class="w-32 text-white md:w-36">
					<AcmeLogo />
				</div>
			</div>
			<LoginForm callbackUrl={callbackUrl} />
		</div>
	</main>
}
