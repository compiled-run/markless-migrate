import { state } from '@markless/core';
import { Button } from './button.tsrx';
import { ArrowRightSolidIcon } from './icons/ArrowRightSolidIcon.tsrx';
import { AtSymbolIcon } from './icons/AtSymbolIcon.tsrx';
import { ExclamationCircleIcon } from './icons/ExclamationCircleIcon.tsrx';
import { KeyIcon } from './icons/KeyIcon.tsrx';
import { go, post } from '../lib/forms.ts';

export default function LoginForm({ callbackUrl }: { readonly callbackUrl: string }) @{
	let errorMessage = state('');
	<form
		class="space-y-3"
		onSubmit={(event) => {
			event.preventDefault();
			const form = event.target as HTMLFormElement;
			void post<{ error?: string; redirect?: string }>('/api/auth/login', form).then((result) => {
				if (result.redirect) return go(result.redirect);
				form.reset();
				errorMessage = result.error ?? 'Something went wrong.';
			});
		}}
	>
		<div class="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8">
			<h1 class="lusitana mb-3 text-2xl">Please log in to continue.</h1>
			<div class="w-full">
				<div>
					<label class="mb-3 mt-5 block text-xs font-medium text-gray-900" for="email">Email</label>
					<div class="relative">
						<input class="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500" id="email" type="email" name="email" placeholder="Enter your email address" required />
						<AtSymbolIcon iconClass="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
					</div>
				</div>
				<div class="mt-4">
					<label class="mb-3 mt-5 block text-xs font-medium text-gray-900" for="password">Password</label>
					<div class="relative">
						<input class="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500" id="password" type="password" name="password" placeholder="Enter password" required minlength="6" />
						<KeyIcon iconClass="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
					</div>
				</div>
			</div>
			<input type="hidden" name="redirectTo" value={callbackUrl} />
			<Button extraClass="mt-4 w-full">
				Log in <ArrowRightSolidIcon iconClass="ml-auto h-5 w-5 text-gray-50" />
			</Button>
			<div class="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
				<ExclamationCircleIcon iconClass={errorMessage ? 'h-5 w-5 text-red-500' : 'hidden'} />
				<p class={errorMessage ? 'text-sm text-red-500' : 'hidden'}>{errorMessage}</p>
			</div>
		</div>
	</form>
}
