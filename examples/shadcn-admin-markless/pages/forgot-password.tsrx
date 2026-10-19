import { computed, element, state } from '@markless/core';
import { z } from 'zod';
import { IconLoader } from '../components/auth/password-icons.tsrx';
import { Logo } from '../components/logo.tsrx';
import { Button } from '../components/ui/button.tsrx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card.tsrx';
import { INPUT_CLASS, LABEL_CLASS } from '../components/ui/variants.ts';
import { zodResolver } from '../lib/parity/hookform-resolvers/index.ts';
import { handleSubmit, revalidate, type FieldErrors } from '../lib/parity/react-hook-form/index.ts';
import { promiseLoading, promiseSuccess, type Toast } from '../lib/parity/sonner/index.ts';
import { Toaster } from '../lib/parity/sonner/toaster.tsrx';
import { sleep } from '../lib/utils.ts';

const formSchema = z.object({
	email: z.email({ error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined) }),
});

type ForgotValues = z.input<typeof formSchema>;

const form = { resolver: zodResolver(formSchema), defaultValues: { email: '' } };
const LABEL = `${LABEL_CLASS} data-[error=true]:text-destructive`;

export default function ForgotPassword() @{
	let email = state('');
	let errors = state<FieldErrors<ForgotValues>>({});
	let submitted = state(false);
	let loading = state(false);
	let toasts = state<Toast[]>([]);
	const emailField = element<HTMLInputElement>();
	const emailError = computed(() => errors.email ?? '');
	const emailInvalid = computed(() => (errors.email ? 'true' : 'false'));
	const emailDescribedBy = computed(() => (errors.email ? '_r_0_-form-item-description _r_0_-form-item-message' : '_r_0_-form-item-description'));

	<div class="contents">
		<div class="container grid h-svh max-w-none items-center justify-center">
			<div class="mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:p-8">
				<div class="mb-4 flex items-center justify-center">
					<Logo class="me-2" />
					<h1 class="text-xl font-medium">Shadcn Admin</h1>
				</div>
				<Card class="max-w-sm gap-4 sm:min-w-sm">
					<CardHeader>
						<CardTitle class="text-lg tracking-tight">Forgot Password</CardTitle>
						<CardDescription>
							Enter your registered email and <br /> we will send you a link to reset your password.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							class="grid gap-2"
							onSubmit={async (event) => {
								event.preventDefault();
								submitted = true;
								const result = handleSubmit(form, { email });
								errors = result.errors;
								if (!result.valid) {
									emailField?.focus();
									return;
								}
								const sent = email;
								loading = true;
								toasts = promiseLoading(toasts, 'forgot-password', 'Sending email...');
								await sleep(2000);
								loading = false;
								email = '';
								submitted = false;
								toasts = promiseSuccess(toasts, 'forgot-password', `Email sent to ${sent}`);
								location.assign('/otp');
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
									value={email}
									name="email"
									onInput={(event) => {
										email = (event.target as HTMLInputElement).value;
										errors = revalidate(form, submitted, { email }, errors);
									}}
								/>
								@if (emailError) {
									<p data-slot="form-message" id="_r_0_-form-item-message" class="text-sm text-destructive">{emailError}</p>
								}
							</div>
							<Button class="mt-2" disabled={loading}>
								Continue
								@if (loading) {
									<IconLoader />
								} @else {
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
								}
							</Button>
						</form>
					</CardContent>
					<CardFooter>
						<p class="mx-auto px-8 text-center text-sm text-balance text-muted-foreground">
							Don't have an account? <a href="/sign-up" class="underline underline-offset-4 hover:text-primary">Sign up</a>.
						</p>
					</CardFooter>
				</Card>
			</div>
		</div>
		<Toaster toasts={toasts} />
	</div>
}
