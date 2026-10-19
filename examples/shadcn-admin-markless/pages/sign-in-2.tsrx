import { computed, element, state } from '@markless/core';
import { z } from 'zod';
import { IconFacebook, IconGithub } from '../components/brand-icons.tsrx';
import { Logo } from '../components/logo.tsrx';
import { Button } from '../components/ui/button.tsrx';
import { INPUT_CLASS, LABEL_CLASS } from '../components/ui/variants.ts';
import { zodResolver } from '../lib/parity/hookform-resolvers/index.ts';
import { firstError, handleSubmit, revalidate, type FieldErrors } from '../lib/parity/react-hook-form/index.ts';
import { sleep } from '../lib/utils.ts';
import { promiseLoading, promiseSuccess, type Toast } from '../lib/parity/sonner/index.ts';
import { Toaster } from '../lib/parity/sonner/toaster.tsrx';
import dashboardLight from '../components/auth/assets/dashboard-light.png?url';
import dashboardDark from '../components/auth/assets/dashboard-dark.png?url';

const formSchema = z.object({
	email: z.email({ error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined) }),
	password: z.string().min(1, 'Please enter your password.').min(7, 'Password must be at least 7 characters long.'),
});

type SignInValues = z.input<typeof formSchema>;

const form = { resolver: zodResolver(formSchema), defaultValues: { email: '', password: '' } };


export default function SignIn2() @{
	let values = state<SignInValues>({ email: '', password: '' });
	let errors = state<FieldErrors<SignInValues>>({});
	let submitted = state(false);
	let loading = state(false);
	let showPassword = state(false);
	let toasts = state<Toast[]>([]);
	const emailField = element<HTMLInputElement>();
	const passwordField = element<HTMLInputElement>();
	const emailError = computed(() => errors.email ?? '');
	const passwordError = computed(() => errors.password ?? '');
	const emailInvalid = computed(() => (errors.email ? 'true' : 'false'));
	const passwordInvalid = computed(() => (errors.password ? 'true' : 'false'));
	const emailDescribedBy = computed(() => (errors.email ? '_r_0_-form-item-description _r_0_-form-item-message' : '_r_0_-form-item-description'));
	const passwordDescribedBy = computed(() => (errors.password ? '_r_1_-form-item-description _r_1_-form-item-message' : '_r_1_-form-item-description'));
	const passwordType = computed(() => (showPassword ? 'text' : 'password'));
	const toggleLabel = computed(() => (showPassword ? 'Hide password' : 'Show password'));

	<div class="contents">
		<div class="relative container grid h-svh flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
			<div class="lg:p-8">
				<div class="mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:w-120 sm:p-8">
					<div class="mb-4 flex items-center justify-center">
						<Logo class="me-2" />
						<h1 class="text-xl font-medium">Shadcn Admin</h1>
					</div>
				</div>
				<div class="mx-auto flex w-full max-w-sm flex-col justify-center space-y-2">
					<div class="flex flex-col space-y-2 text-start">
						<h2 class="text-lg font-semibold tracking-tight">Sign in</h2>
						<p class="text-sm text-muted-foreground">
							Enter your email and password below to log into <br class="max-sm:hidden" /> your account. Don't have an account? <a href="/sign-up" class="text-nowrap underline underline-offset-4 hover:text-primary">Sign Up</a>
						</p>
					</div>
				<form
					class="grid gap-3"
					onSubmit={async (event) => {
						event.preventDefault();
						submitted = true;
						const result = handleSubmit(form, { email: values.email, password: values.password });
						errors = result.errors;
						if (!result.valid) {
							const first = firstError(['email', 'password'], result.errors);
							if (first === 'email') emailField?.focus();
							else if (first === 'password') passwordField?.focus();
							return;
						}
						loading = true;
						toasts = promiseLoading(toasts, 'sign-in', 'Signing in...');
						await sleep(2000);
						loading = false;
						toasts = promiseSuccess(toasts, 'sign-in', `Welcome back, ${values.email}!`);
						document.cookie = `thisisjustarandomstring=${JSON.stringify('mock-access-token')}; path=/; max-age=${60 * 60 * 24 * 7}`;
						location.replace('/');
					}}
				>
					<div data-slot="form-item" class="grid gap-2">
						<label data-slot="form-label" class={`${LABEL_CLASS} data-[error=true]:text-destructive`} data-error={emailInvalid} for="_r_0_-form-item">Email</label>
						<input
							el={emailField}
							data-slot="form-control"
							class={INPUT_CLASS}
							placeholder="name@example.com"
							id="_r_0_-form-item"
							aria-describedby={emailDescribedBy}
							aria-invalid={emailInvalid}
							value={values.email}
							name="email"
							onInput={(event) => {
								values.email = (event.target as HTMLInputElement).value;
								errors = revalidate(form, submitted, { email: values.email, password: values.password }, errors);
							}}
						/>
						@if (emailError) {
							<p data-slot="form-message" id="_r_0_-form-item-message" class="text-sm text-destructive">{emailError}</p>
						}
					</div>
					<div data-slot="form-item" class="grid gap-2 relative">
						<label data-slot="form-label" class={`${LABEL_CLASS} data-[error=true]:text-destructive`} data-error={passwordInvalid} for="_r_1_-form-item">Password</label>
						<div class="relative rounded-md">
							<input
								el={passwordField}
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
								placeholder="********"
								data-slot="form-control"
								id="_r_1_-form-item"
								aria-describedby={passwordDescribedBy}
								aria-invalid={passwordInvalid}
								type={passwordType}
								value={values.password}
								name="password"
								onInput={(event) => {
									values.password = (event.target as HTMLInputElement).value;
									errors = revalidate(form, submitted, { email: values.email, password: values.password }, errors);
								}}
							/>
							<Button type="button" size="icon" variant="ghost" class="absolute inset-e-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground" onClick={() => (showPassword = !showPassword)}>
								@if (showPassword) {
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
								} @else {
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" class="lucide lucide-eye-off" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>
								}
								<span class="sr-only">{toggleLabel}</span>
							</Button>
						</div>
						@if (passwordError) {
							<p data-slot="form-message" id="_r_1_-form-item-message" class="text-sm text-destructive">{passwordError}</p>
						}
						<a href="/forgot-password" class="absolute inset-e-0 -top-0.5 text-sm font-medium text-muted-foreground hover:opacity-75">Forgot password?</a>
					</div>
					<Button class="mt-2" disabled={loading}>
						@if (loading) {
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" class="lucide lucide-loader-circle animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
						} @else {
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" class="lucide lucide-log-in" aria-hidden="true"><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></svg>
						}
						Sign in
					</Button>
					<div class="relative my-2">
						<div class="absolute inset-0 flex items-center">
							<span class="w-full border-t"></span>
						</div>
						<div class="relative flex justify-center text-xs uppercase">
							<span class="bg-background px-2 text-muted-foreground">Or continue with</span>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<Button variant="outline" type="button" disabled={loading}><IconGithub /> GitHub</Button>
						<Button variant="outline" type="button" disabled={loading}><IconFacebook /> Facebook</Button>
					</div>
				</form>
					<p class="px-8 text-center text-sm text-muted-foreground">
						By clicking sign in, you agree to our <a href="/terms" class="underline underline-offset-4 hover:text-primary">Terms of Service</a> and <a href="/privacy" class="underline underline-offset-4 hover:text-primary">Privacy Policy</a>.
					</p>
				</div>
			</div>
			<div class="relative h-full overflow-hidden bg-muted max-lg:hidden [&>img]:absolute [&>img]:top-[15%] [&>img]:left-20 [&>img]:h-full [&>img]:w-full [&>img]:object-cover [&>img]:object-top-left [&>img]:select-none">
				<img src={dashboardLight} class="dark:hidden" width="1024" height="1151" alt="Shadcn-Admin" />
				<img src={dashboardDark} class="hidden dark:block" width="1024" height="1138" alt="Shadcn-Admin" />
			</div>
		</div>
		<Toaster toasts={toasts} />
	</div>
}
