import { computed, element, state } from '@markless/core';
import { z } from 'zod';
import { IconFacebook, IconGithub } from '../components/brand-icons.tsrx';
import { IconEye, IconEyeOff, IconLoader } from '../components/auth/password-icons.tsrx';
import { Logo } from '../components/logo.tsrx';
import { Button } from '../components/ui/button.tsrx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card.tsrx';
import { INPUT_CLASS, LABEL_CLASS } from '../components/ui/variants.ts';
import { zodResolver } from '../lib/parity/hookform-resolvers/index.ts';
import { firstError, handleSubmit, revalidate, type FieldErrors } from '../lib/parity/react-hook-form/index.ts';
import { DURATION, expired, promiseLoading, promiseSuccess, type Toast } from '../lib/parity/sonner/index.ts';
import { Toaster } from '../lib/parity/sonner/toaster.tsrx';
import { sleep } from '../lib/utils.ts';

const formSchema = z
	.object({
		email: z.email({ error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined) }),
		password: z.string().min(1, 'Please enter your password.').min(7, 'Password must be at least 7 characters long.'),
		confirmPassword: z.string().min(1, 'Please confirm your password.'),
	})
	.refine((data) => data.password === data.confirmPassword, { message: "Passwords don't match.", path: ['confirmPassword'] });

type SignUpValues = z.input<typeof formSchema>;

const form = { resolver: zodResolver(formSchema), defaultValues: { email: '', password: '', confirmPassword: '' } };
const LABEL = `${LABEL_CLASS} data-[error=true]:text-destructive`;
const PASSWORD_CLASS = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50';

export default function SignUp() @{
	let values = state<SignUpValues>({ email: '', password: '', confirmPassword: '' });
	let errors = state<FieldErrors<SignUpValues>>({});
	let submitted = state(false);
	let loading = state(false);
	let showPassword = state(false);
	let showConfirm = state(false);
	let toasts = state<Toast[]>([]);
	const emailField = element<HTMLInputElement>();
	const passwordField = element<HTMLInputElement>();
	const confirmField = element<HTMLInputElement>();
	const emailError = computed(() => errors.email ?? '');
	const passwordError = computed(() => errors.password ?? '');
	const confirmError = computed(() => errors.confirmPassword ?? '');
	const emailInvalid = computed(() => (errors.email ? 'true' : 'false'));
	const passwordInvalid = computed(() => (errors.password ? 'true' : 'false'));
	const confirmInvalid = computed(() => (errors.confirmPassword ? 'true' : 'false'));
	const emailDescribedBy = computed(() => (errors.email ? '_r_0_-form-item-description _r_0_-form-item-message' : '_r_0_-form-item-description'));
	const passwordDescribedBy = computed(() => (errors.password ? '_r_1_-form-item-description _r_1_-form-item-message' : '_r_1_-form-item-description'));
	const confirmDescribedBy = computed(() => (errors.confirmPassword ? '_r_2_-form-item-description _r_2_-form-item-message' : '_r_2_-form-item-description'));
	const passwordType = computed(() => (showPassword ? 'text' : 'password'));
	const confirmType = computed(() => (showConfirm ? 'text' : 'password'));
	const passwordToggleLabel = computed(() => (showPassword ? 'Hide password' : 'Show password'));
	const confirmToggleLabel = computed(() => (showConfirm ? 'Hide password' : 'Show password'));

	<div class="contents">
		<div class="container grid h-svh max-w-none items-center justify-center">
			<div class="mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:p-8">
				<div class="mb-4 flex items-center justify-center">
					<Logo class="me-2" />
					<h1 class="text-xl font-medium">Shadcn Admin</h1>
				</div>
				<Card class="max-w-sm gap-4">
					<CardHeader>
						<CardTitle class="text-lg tracking-tight">Create an account</CardTitle>
						<CardDescription>
							Enter your email and password to create an account. <br /> Already have an account? <a href="/sign-in" class="underline underline-offset-4 hover:text-primary">Sign In</a>
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							class="grid gap-3"
							onSubmit={async (event) => {
								event.preventDefault();
								submitted = true;
								const result = handleSubmit(form, { email: values.email, password: values.password, confirmPassword: values.confirmPassword });
								errors = result.errors;
								if (!result.valid) {
									const first = firstError(['email', 'password', 'confirmPassword'], result.errors);
									if (first === 'email') emailField?.focus();
									else if (first === 'password') passwordField?.focus();
									else if (first === 'confirmPassword') confirmField?.focus();
									return;
								}
								const email = values.email;
								const id = `sign-up-${Date.now()}`;
								loading = true;
								toasts = promiseLoading(toasts, id, 'Creating account...');
								await sleep(2000);
								loading = false;
								toasts = promiseSuccess(toasts, id, `Account created for ${email}.`);
								await sleep(DURATION);
								toasts = expired(toasts, id);
							}}
						>
							<div data-slot="form-item" class="grid gap-2">
								<label data-slot="form-label" class={LABEL} data-error={emailInvalid} for="_r_0_-form-item">Email</label>
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
										errors = revalidate(form, submitted, { email: values.email, password: values.password, confirmPassword: values.confirmPassword }, errors);
									}}
								/>
								@if (emailError) {
									<p data-slot="form-message" id="_r_0_-form-item-message" class="text-sm text-destructive">{emailError}</p>
								}
							</div>
							<div data-slot="form-item" class="grid gap-2">
								<label data-slot="form-label" class={LABEL} data-error={passwordInvalid} for="_r_1_-form-item">Password</label>
								<div class="relative rounded-md">
									<input
										el={passwordField}
										class={PASSWORD_CLASS}
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
											errors = revalidate(form, submitted, { email: values.email, password: values.password, confirmPassword: values.confirmPassword }, errors);
										}}
									/>
									<Button type="button" size="icon" variant="ghost" class="absolute inset-e-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground" onClick={() => (showPassword = !showPassword)}>
										@if (showPassword) {
											<IconEye />
										} @else {
											<IconEyeOff />
										}
										<span class="sr-only">{passwordToggleLabel}</span>
									</Button>
								</div>
								@if (passwordError) {
									<p data-slot="form-message" id="_r_1_-form-item-message" class="text-sm text-destructive">{passwordError}</p>
								}
							</div>
							<div data-slot="form-item" class="grid gap-2">
								<label data-slot="form-label" class={LABEL} data-error={confirmInvalid} for="_r_2_-form-item">Confirm Password</label>
								<div class="relative rounded-md">
									<input
										el={confirmField}
										class={PASSWORD_CLASS}
										placeholder="********"
										data-slot="form-control"
										id="_r_2_-form-item"
										aria-describedby={confirmDescribedBy}
										aria-invalid={confirmInvalid}
										type={confirmType}
										value={values.confirmPassword}
										name="confirmPassword"
										onInput={(event) => {
											values.confirmPassword = (event.target as HTMLInputElement).value;
											errors = revalidate(form, submitted, { email: values.email, password: values.password, confirmPassword: values.confirmPassword }, errors);
										}}
									/>
									<Button type="button" size="icon" variant="ghost" class="absolute inset-e-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground" onClick={() => (showConfirm = !showConfirm)}>
										@if (showConfirm) {
											<IconEye />
										} @else {
											<IconEyeOff />
										}
										<span class="sr-only">{confirmToggleLabel}</span>
									</Button>
								</div>
								@if (confirmError) {
									<p data-slot="form-message" id="_r_2_-form-item-message" class="text-sm text-destructive">{confirmError}</p>
								}
							</div>
							<Button class="mt-2" disabled={loading}>
								@if (loading) {
									<IconLoader />
								} @else {
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-plus" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
								}
								Create Account
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
								<Button variant="outline" class="w-full" type="button" disabled={loading}><IconGithub /> GitHub</Button>
								<Button variant="outline" class="w-full" type="button" disabled={loading}><IconFacebook /> Facebook</Button>
							</div>
						</form>
					</CardContent>
					<CardFooter>
						<p class="px-8 text-center text-sm text-muted-foreground">
							By creating an account, you agree to our <a href="/terms" class="underline underline-offset-4 hover:text-primary">Terms of Service</a> and <a href="/privacy" class="underline underline-offset-4 hover:text-primary">Privacy Policy</a>.
						</p>
					</CardFooter>
				</Card>
			</div>
		</div>
		<Toaster toasts={toasts} />
	</div>
}
