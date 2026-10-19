import { computed, element, state } from '@markless/core';
import { z } from 'zod';
import { Logo } from '../components/logo.tsrx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card.tsrx';
import { LABEL_CLASS } from '../components/ui/variants.ts';
import { zodResolver } from '../lib/parity/hookform-resolvers/index.ts';
import { accept, focusRange, normalizeRange, slotActive, slotChar, trackSelection } from '../lib/parity/input-otp/behaviour.ts';
import { handleSubmit, revalidate, type FieldErrors } from '../lib/parity/react-hook-form/index.ts';
import { DURATION, expired, message, type Toast } from '../lib/parity/sonner/index.ts';
import { Toaster } from '../lib/parity/sonner/toaster.tsrx';
import { sleep } from '../lib/utils.ts';

const formSchema = z.object({
	otp: z.string().min(6, 'Please enter the 6-digit code.').max(6, 'Please enter the 6-digit code.'),
});

type OtpValues = z.input<typeof formSchema>;

const form = { resolver: zodResolver(formSchema), defaultValues: { otp: '' } };
const INPUT_STYLE = 'position: absolute; inset: 0px; width: 100%; height: 100%; display: flex; text-align: left; opacity: 1; color: transparent; pointer-events: all; background: transparent; caret-color: transparent; border: 0px solid transparent; outline: transparent solid 0px; box-shadow: none; line-height: 1; letter-spacing: -0.5em; font-size: var(--root-height); font-family: monospace; font-variant-numeric: tabular-nums;';

export default function Otp() @{
	let otp = state('');
	let focused = state(false);
	let mss = state<number | null>(0);
	let mse = state<number | null>(0);
	let errors = state<FieldErrors<OtpValues>>({});
	let submitted = state(false);
	let loading = state(false);
	let toasts = state<Toast[]>([]);
	const otpField = element<HTMLInputElement>();
	const otpError = computed(() => errors.otp ?? '');
	const otpInvalid = computed(() => (errors.otp ? 'true' : 'false'));
	const otpDescribedBy = computed(() => (errors.otp ? '_r_0_-form-item-description _r_0_-form-item-message' : '_r_0_-form-item-description'));
	const placeholderShown = computed(() => (otp.length === 0 ? 'true' : undefined));
	const mssAttr = computed(() => (mss === null ? undefined : String(mss)));
	const mseAttr = computed(() => (mse === null ? undefined : String(mse)));
	const verifyDisabled = computed(() => otp.length < 6 || loading);
	const slot0Char = computed(() => slotChar(otp, 0));
	const slot0Active = computed(() => (slotActive(focused, mss, mse, 0) ? 'true' : 'false'));
	const slot0Caret = computed(() => slotActive(focused, mss, mse, 0) && slotChar(otp, 0) === '');
	const slot1Char = computed(() => slotChar(otp, 1));
	const slot1Active = computed(() => (slotActive(focused, mss, mse, 1) ? 'true' : 'false'));
	const slot1Caret = computed(() => slotActive(focused, mss, mse, 1) && slotChar(otp, 1) === '');
	const slot2Char = computed(() => slotChar(otp, 2));
	const slot2Active = computed(() => (slotActive(focused, mss, mse, 2) ? 'true' : 'false'));
	const slot2Caret = computed(() => slotActive(focused, mss, mse, 2) && slotChar(otp, 2) === '');
	const slot3Char = computed(() => slotChar(otp, 3));
	const slot3Active = computed(() => (slotActive(focused, mss, mse, 3) ? 'true' : 'false'));
	const slot3Caret = computed(() => slotActive(focused, mss, mse, 3) && slotChar(otp, 3) === '');
	const slot4Char = computed(() => slotChar(otp, 4));
	const slot4Active = computed(() => (slotActive(focused, mss, mse, 4) ? 'true' : 'false'));
	const slot4Caret = computed(() => slotActive(focused, mss, mse, 4) && slotChar(otp, 4) === '');
	const slot5Char = computed(() => slotChar(otp, 5));
	const slot5Active = computed(() => (slotActive(focused, mss, mse, 5) ? 'true' : 'false'));
	const slot5Caret = computed(() => slotActive(focused, mss, mse, 5) && slotChar(otp, 5) === '');

	<div class="contents">
		<div class="container grid h-svh max-w-none items-center justify-center">
			<div class="mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:p-8">
				<div class="mb-4 flex items-center justify-center">
					<Logo class="me-2" />
					<h1 class="text-xl font-medium">Shadcn Admin</h1>
				</div>
				<Card class="max-w-md gap-4">
					<CardHeader>
						<CardTitle class="text-base tracking-tight">Two-factor Authentication</CardTitle>
						<CardDescription>
							Please enter the authentication code. <br /> We have sent the authentication code to your email.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							class="grid gap-2"
							onSubmit={async (event) => {
								event.preventDefault();
								submitted = true;
								const result = handleSubmit(form, { otp });
								errors = result.errors;
								if (!result.valid) {
									otpField?.focus();
									return;
								}
								const id = `otp-${Date.now()}`;
								loading = true;
								toasts = message(toasts, id, 'You submitted the following values:', JSON.stringify({ otp }, null, 2));
								await sleep(1000);
								loading = false;
								location.assign('/');
								await sleep(DURATION - 1000);
								toasts = expired(toasts, id);
							}}
						>
							<div data-slot="form-item" class="grid gap-2">
								<label data-slot="form-label" class={`${LABEL_CLASS} data-[error=true]:text-destructive sr-only`} data-error={otpInvalid} for="_r_0_-form-item">One-Time Password</label>
								<div data-input-otp-container="true" class={'flex items-center gap-2 has-disabled:opacity-50 justify-between sm:[&>[data-slot="input-otp-group"]>div]:w-12'} style="position: relative; cursor: text; user-select: none; pointer-events: none; --root-height: 36px;">
								<div data-slot="input-otp-group" class="flex items-center">
									<div data-slot="input-otp-slot" data-active={slot0Active} class="relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40">
										<span class="contents">{slot0Char}</span>
										@if (slot0Caret) {
											<div class="pointer-events-none absolute inset-0 flex items-center justify-center"><div class="h-4 w-px animate-caret-blink bg-foreground duration-1000"></div></div>
										}
									</div>
									<div data-slot="input-otp-slot" data-active={slot1Active} class="relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40">
										<span class="contents">{slot1Char}</span>
										@if (slot1Caret) {
											<div class="pointer-events-none absolute inset-0 flex items-center justify-center"><div class="h-4 w-px animate-caret-blink bg-foreground duration-1000"></div></div>
										}
									</div>
								</div>
								<div data-slot="input-otp-separator" role="separator"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus" aria-hidden="true"><path d="M5 12h14" /></svg></div>
								<div data-slot="input-otp-group" class="flex items-center">
									<div data-slot="input-otp-slot" data-active={slot2Active} class="relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40">
										<span class="contents">{slot2Char}</span>
										@if (slot2Caret) {
											<div class="pointer-events-none absolute inset-0 flex items-center justify-center"><div class="h-4 w-px animate-caret-blink bg-foreground duration-1000"></div></div>
										}
									</div>
									<div data-slot="input-otp-slot" data-active={slot3Active} class="relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40">
										<span class="contents">{slot3Char}</span>
										@if (slot3Caret) {
											<div class="pointer-events-none absolute inset-0 flex items-center justify-center"><div class="h-4 w-px animate-caret-blink bg-foreground duration-1000"></div></div>
										}
									</div>
								</div>
								<div data-slot="input-otp-separator" role="separator"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus" aria-hidden="true"><path d="M5 12h14" /></svg></div>
								<div data-slot="input-otp-group" class="flex items-center">
									<div data-slot="input-otp-slot" data-active={slot4Active} class="relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40">
										<span class="contents">{slot4Char}</span>
										@if (slot4Caret) {
											<div class="pointer-events-none absolute inset-0 flex items-center justify-center"><div class="h-4 w-px animate-caret-blink bg-foreground duration-1000"></div></div>
										}
									</div>
									<div data-slot="input-otp-slot" data-active={slot5Active} class="relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40">
										<span class="contents">{slot5Char}</span>
										@if (slot5Caret) {
											<div class="pointer-events-none absolute inset-0 flex items-center justify-center"><div class="h-4 w-px animate-caret-blink bg-foreground duration-1000"></div></div>
										}
									</div>
								</div>
									<div style="position: absolute; inset: 0px; pointer-events: none;">
										<input
											el={otpField}
											autocomplete="one-time-code"
											data-slot="form-control"
											class="disabled:cursor-not-allowed"
											id="_r_0_-form-item"
											aria-describedby={otpDescribedBy}
											aria-invalid={otpInvalid}
											data-input-otp="true"
											data-input-otp-placeholder-shown={placeholderShown}
											inputmode="numeric"
											maxlength="6"
											value={otp}
											name="otp"
											data-input-otp-mss={mssAttr}
											data-input-otp-mse={mseAttr}
											style={INPUT_STYLE}
											onInput={(event) => {
												const input = event.target as HTMLInputElement;
												otp = accept(input, 6);
												const range = normalizeRange(input);
												mss = range[0];
												mse = range[1];
												errors = revalidate(form, submitted, { otp }, errors);
											}}
											onFocus={(event) => {
												const input = event.target as HTMLInputElement;
												const range = focusRange(input, 6);
												mss = range[0];
												mse = range[1];
												focused = true;
												trackSelection(input, (next) => {
													mss = next[0];
													mse = next[1];
												});
											}}
											onBlur={(event) => {
												const input = event.target as HTMLInputElement;
												focused = false;
												setTimeout(() => {
													mss = input.selectionStart;
													mse = input.selectionEnd;
												}, 50);
											}}
										/>
									</div>
								</div>
								@if (otpError) {
									<p data-slot="form-message" id="_r_0_-form-item-message" class="text-sm text-destructive">{otpError}</p>
								}
							</div>
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3 mt-2" disabled={verifyDisabled}>Verify</button>
						</form>
					</CardContent>
					<CardFooter>
						<p class="px-8 text-center text-sm text-muted-foreground">
							Haven't received it? <a href="/sign-in" class="underline underline-offset-4 hover:text-primary">Resend a new code.</a>.
						</p>
					</CardFooter>
				</Card>
			</div>
		</div>
		<Toaster toasts={toasts} />
	</div>
}
