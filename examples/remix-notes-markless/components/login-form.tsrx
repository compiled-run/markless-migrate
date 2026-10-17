import { state } from '@markless/core';
import { focusError, go, submit } from '../lib/forms.ts';

export default function LoginForm({ redirectTo, joinHref }: { readonly redirectTo: string; readonly joinHref: string }) @{
	let emailError = state('');
	let passwordError = state('');
	<form
		method="post"
		action="/login"
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
				<input id="password" name="password" type="password" autocomplete="current-password" aria-invalid={passwordError ? 'true' : undefined} aria-describedby="password-error" class="w-full rounded border border-gray-500 px-2 py-1 text-lg" />
				@if (passwordError) {
					<div class="pt-1 text-red-700" id="password-error">{passwordError}</div>
				}
			</div>
		</div>
		<input type="hidden" name="redirectTo" value={redirectTo} />
		<button type="submit" class="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:bg-blue-400">Log in</button>
		<div class="flex items-center justify-between">
			<div class="flex items-center">
				<input id="remember" name="remember" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
				<label for="remember" class="ml-2 block text-sm text-gray-900">Remember me</label>
			</div>
			<div class="text-center text-sm text-gray-500">
				Don't have an account?{' '}
				<a class="text-blue-500 underline" href={joinHref}>Sign up</a>
			</div>
		</div>
	</form>
}
