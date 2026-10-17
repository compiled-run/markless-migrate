import { state } from '@markless/core';
import { focusError, go, submit } from '../lib/forms.ts';

export default function JoinForm({ redirectTo, loginHref }: { readonly redirectTo: string | undefined; readonly loginHref: string }) @{
	let emailError = state('');
	let passwordError = state('');
	<form
		method="post"
		action="/join"
		class="space-y-6"
		onSubmit={(event) => {
			event.preventDefault();
			const form = event.target as HTMLFormElement;
			void submit(form).then((result) => {
				if (result.redirect) return go(result.redirect);
				emailError = result.errors?.email ?? '';
				passwordError = result.errors?.password ?? '';
				focusError(form, result.errors, ['email', 'password']);
			});
		}}
	>
		<div>
			<label for="email" class="block text-sm font-medium text-gray-700">Email address</label>
			<div class="mt-1">
				<input id="email" required autofocus name="email" type="email" autocomplete="email" aria-invalid={emailError ? 'true' : undefined} aria-describedby="email-error" class="w-full rounded border border-gray-500 px-2 py-1 text-lg" />
				@if (emailError) {
					<div class="pt-1 text-red-700" id="email-error">{emailError}</div>
				}
			</div>
		</div>
		<div>
			<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
			<div class="mt-1">
				<input id="password" name="password" type="password" autocomplete="new-password" aria-invalid={passwordError ? 'true' : undefined} aria-describedby="password-error" class="w-full rounded border border-gray-500 px-2 py-1 text-lg" />
				@if (passwordError) {
					<div class="pt-1 text-red-700" id="password-error">{passwordError}</div>
				}
			</div>
		</div>
		<input type="hidden" name="redirectTo" value={redirectTo} />
		<button type="submit" class="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:bg-blue-400">Create Account</button>
		<div class="flex items-center justify-center">
			<div class="text-center text-sm text-gray-500">
				Already have an account?{' '}
				<a class="text-blue-500 underline" href={loginHref}>Log in</a>
			</div>
		</div>
	</form>
}
