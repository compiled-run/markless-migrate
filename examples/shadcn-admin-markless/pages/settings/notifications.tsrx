import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { revalidate, submitForm } from '../../lib/settings/validate.ts';
import { SettingsLayout } from '../../components/settings/settings-layout.tsrx';
import { layoutPrefs } from '../../components/layout/prefs.ts';
import { nextRadio } from '../../lib/settings/radio.ts';
import { DURATION, expired, message, type Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';

export default function SettingsNotifications({ http }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	let type = state('');
	let communication = state(false);
	let marketing = state(false);
	let social = state(true);
	let mobile = state<boolean | undefined>(undefined);
	let errors = state<Record<string, string>>({});
	let submittedOnce = state(false);
	let toasts = state<Toast[]>([]);
	const typeError = computed(() => errors.type ?? '');
	const typeInvalid = computed(() => (errors.type ? 'true' : 'false'));
	const typeDescribed = computed(() => (errors.type ? 'notifications-type-form-item-description notifications-type-form-item-message' : 'notifications-type-form-item-description'));
	const allChecked = computed(() => (type === 'all' ? 'true' : 'false'));
	const allState = computed(() => (type === 'all' ? 'checked' : 'unchecked'));
	const allTab = computed(() => (type === 'all' ? '0' : '-1'));
	const allOn = computed(() => type === 'all');
	const allDescribed = computed(() => (errors.type ? 'notifications-all-form-item-description notifications-all-form-item-message' : 'notifications-all-form-item-description'));
	const mentionsChecked = computed(() => (type === 'mentions' ? 'true' : 'false'));
	const mentionsState = computed(() => (type === 'mentions' ? 'checked' : 'unchecked'));
	const mentionsTab = computed(() => (type === 'mentions' ? '0' : '-1'));
	const mentionsOn = computed(() => type === 'mentions');
	const mentionsDescribed = computed(() => (errors.type ? 'notifications-mentions-form-item-description notifications-mentions-form-item-message' : 'notifications-mentions-form-item-description'));
	const noneChecked = computed(() => (type === 'none' ? 'true' : 'false'));
	const noneState = computed(() => (type === 'none' ? 'checked' : 'unchecked'));
	const noneTab = computed(() => (type === 'none' ? '0' : '-1'));
	const noneOn = computed(() => type === 'none');
	const noneDescribed = computed(() => (errors.type ? 'notifications-none-form-item-description notifications-none-form-item-message' : 'notifications-none-form-item-description'));
	const communicationChecked = computed(() => (communication ? 'true' : 'false'));
	const communicationState = computed(() => (communication ? 'checked' : 'unchecked'));
	const marketingChecked = computed(() => (marketing ? 'true' : 'false'));
	const marketingState = computed(() => (marketing ? 'checked' : 'unchecked'));
	const socialChecked = computed(() => (social ? 'true' : 'false'));
	const socialState = computed(() => (social ? 'checked' : 'unchecked'));
	const mobileChecked = computed(() => (mobile === true ? 'true' : 'false'));
	const mobileState = computed(() => (mobile === true ? 'checked' : 'unchecked'));
	const mobileOn = computed(() => mobile === true);

	<SettingsLayout active="/settings/notifications" prefs={prefs} title="Notifications" desc="Configure how you receive notifications.">
		<form
			class="space-y-8"
			novalidate
			onSubmit={async (event) => {
				event.preventDefault();
				submittedOnce = true;
				const { errors: found, json } = await submitForm('notifications', { type: type === "" ? undefined : type, mobile, communication_emails: communication, social_emails: social, marketing_emails: marketing, security_emails: true });
				errors = found;
				if (Object.keys(found).length > 0) return;
				const id = `notifications-${Date.now()}`;
				toasts = message(toasts, id, 'You submitted the following values:', json);
				setTimeout(() => {
					toasts = expired(toasts, id);
				}, DURATION);
			}}
		>
			<div data-slot="form-item" class="grid gap-2 relative space-y-3">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={typeInvalid} for="notifications-type-form-item">Notify me about...</label>
				<div role="radiogroup" aria-required="false" dir="ltr" data-slot="form-control" class="flex flex-col gap-2" id="notifications-type-form-item" aria-describedby={typeDescribed} aria-invalid={typeInvalid} tabindex="0" style="outline: none;" onFocus={(event) => {
					const group = event.target as HTMLElement;
					if (group.getAttribute('role') === 'radiogroup') (group.querySelector<HTMLElement>('[role=radio][tabindex="0"]') ?? group.querySelector<HTMLElement>('[role=radio]'))?.focus();
				}} onKeydown={(event) => {
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
					const next = nextRadio(event.target, event.key);
					if (next) {
						type = next.value;
						next.focus();
						if (submittedOnce) revalidate('notifications', { type: next.value, mobile, communication_emails: communication, social_emails: social, marketing_emails: marketing, security_emails: true }, errors, 'type').then((next) => {
							errors = next;
						});
					}
				}}>
					<div data-slot="form-item" class="gap-2 flex items-center">
						<button type="button" role="radio" aria-checked={allChecked} data-state={allState} value="all" data-slot="form-control" class="aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40" id="notifications-all-form-item" aria-describedby={allDescribed} aria-invalid={typeInvalid} tabindex={allTab} data-radix-collection-item="" onClick={() => {
							type = 'all';
							if (submittedOnce) revalidate('notifications', { type, mobile, communication_emails: communication, social_emails: social, marketing_emails: marketing, security_emails: true }, errors, 'type').then((next) => {
								errors = next;
							});
						}}>
							@if (allOn) {
								<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="radio" value="all" checked={allOn} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 16px; height: 16px;" />
						<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive font-normal" data-error={typeInvalid} for="notifications-all-form-item">All new messages</label>
					</div>
					<div data-slot="form-item" class="gap-2 flex items-center">
						<button type="button" role="radio" aria-checked={mentionsChecked} data-state={mentionsState} value="mentions" data-slot="form-control" class="aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40" id="notifications-mentions-form-item" aria-describedby={mentionsDescribed} aria-invalid={typeInvalid} tabindex={mentionsTab} data-radix-collection-item="" onClick={() => {
							type = 'mentions';
							if (submittedOnce) revalidate('notifications', { type, mobile, communication_emails: communication, social_emails: social, marketing_emails: marketing, security_emails: true }, errors, 'type').then((next) => {
								errors = next;
							});
						}}>
							@if (mentionsOn) {
								<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="radio" value="mentions" checked={mentionsOn} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 16px; height: 16px;" />
						<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive font-normal" data-error={typeInvalid} for="notifications-mentions-form-item">Direct messages and mentions</label>
					</div>
					<div data-slot="form-item" class="gap-2 flex items-center">
						<button type="button" role="radio" aria-checked={noneChecked} data-state={noneState} value="none" data-slot="form-control" class="aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40" id="notifications-none-form-item" aria-describedby={noneDescribed} aria-invalid={typeInvalid} tabindex={noneTab} data-radix-collection-item="" onClick={() => {
							type = 'none';
							if (submittedOnce) revalidate('notifications', { type, mobile, communication_emails: communication, social_emails: social, marketing_emails: marketing, security_emails: true }, errors, 'type').then((next) => {
								errors = next;
							});
						}}>
							@if (noneOn) {
								<span data-state="checked" data-slot="radio-group-indicator" class="relative flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg></span>
							}
						</button>
						<input aria-hidden="true" tabindex="-1" type="radio" value="none" checked={noneOn} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 16px; height: 16px;" />
						<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive font-normal" data-error={typeInvalid} for="notifications-none-form-item">Nothing</label>
					</div>
				</div>
				@if (typeError) {
					<p data-slot="form-message" id="notifications-type-form-item-message" class="text-sm text-destructive">{typeError}</p>
				}
			</div>
			<div class="relative">
				<h3 class="mb-4 text-lg font-medium">Email Notifications</h3>
				<div class="space-y-4">
					<div data-slot="form-item" class="gap-2 flex flex-row items-center justify-between rounded-lg border p-4">
						<div class="space-y-0.5">
							<label data-slot="form-label" class="flex items-center gap-2 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive text-base" data-error="false" for="notifications-communication-form-item">Communication emails</label>
							<p data-slot="form-description" id="notifications-communication-form-item-description" class="text-sm text-muted-foreground">Receive emails about your account activity.</p>
						</div>
						<button type="button" role="switch" aria-checked={communicationChecked} data-state={communicationState} value="on" data-slot="form-control" class="peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80" id="notifications-communication-form-item" aria-describedby="notifications-communication-form-item-description" aria-invalid="false" onClick={() => (communication = !communication)}>
							<span data-state={communicationState} data-slot="switch-thumb" class="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-[calc(100%-2px)] dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"></span>
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={communication} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 32px; height: 18.390625px;" />
					</div>
					<div data-slot="form-item" class="gap-2 flex flex-row items-center justify-between rounded-lg border p-4">
						<div class="space-y-0.5">
							<label data-slot="form-label" class="flex items-center gap-2 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive text-base" data-error="false" for="notifications-marketing-form-item">Marketing emails</label>
							<p data-slot="form-description" id="notifications-marketing-form-item-description" class="text-sm text-muted-foreground">Receive emails about new products, features, and more.</p>
						</div>
						<button type="button" role="switch" aria-checked={marketingChecked} data-state={marketingState} value="on" data-slot="form-control" class="peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80" id="notifications-marketing-form-item" aria-describedby="notifications-marketing-form-item-description" aria-invalid="false" onClick={() => (marketing = !marketing)}>
							<span data-state={marketingState} data-slot="switch-thumb" class="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-[calc(100%-2px)] dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"></span>
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={marketing} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 32px; height: 18.390625px;" />
					</div>
					<div data-slot="form-item" class="gap-2 flex flex-row items-center justify-between rounded-lg border p-4">
						<div class="space-y-0.5">
							<label data-slot="form-label" class="flex items-center gap-2 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive text-base" data-error="false" for="notifications-social-form-item">Social emails</label>
							<p data-slot="form-description" id="notifications-social-form-item-description" class="text-sm text-muted-foreground">Receive emails for friend requests, follows, and more.</p>
						</div>
						<button type="button" role="switch" aria-checked={socialChecked} data-state={socialState} value="on" data-slot="form-control" class="peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80" id="notifications-social-form-item" aria-describedby="notifications-social-form-item-description" aria-invalid="false" onClick={() => (social = !social)}>
							<span data-state={socialState} data-slot="switch-thumb" class="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-[calc(100%-2px)] dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"></span>
						</button>
						<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={social} style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 32px; height: 18.390625px;" />
					</div>
					<div data-slot="form-item" class="gap-2 flex flex-row items-center justify-between rounded-lg border p-4">
						<div class="space-y-0.5">
							<label data-slot="form-label" class="flex items-center gap-2 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive text-base" data-error="false" for="notifications-security-form-item">Security emails</label>
							<p data-slot="form-description" id="notifications-security-form-item-description" class="text-sm text-muted-foreground">Receive emails about your account activity and security.</p>
						</div>
						<button type="button" role="switch" aria-checked="true" data-state="checked" data-disabled="" disabled value="on" data-slot="form-control" class="peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80" aria-readonly="true" id="notifications-security-form-item" aria-describedby="notifications-security-form-item-description" aria-invalid="false">
							<span data-state="checked" data-disabled="" data-slot="switch-thumb" class="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-[calc(100%-2px)] dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"></span>
						</button>
						<input aria-hidden="true" disabled tabindex="-1" type="checkbox" value="on" checked style="transform: translateX(-100%); position: absolute; pointer-events: none; opacity: 0; margin: 0px; width: 32px; height: 18.390625px;" />
					</div>
				</div>
			</div>
			<div data-slot="form-item" class="gap-2 relative flex flex-row items-start">
				<button type="button" role="checkbox" aria-checked={mobileChecked} data-state={mobileState} value="on" data-slot="form-control" class="peer size-4 shrink-0 rounded-lg border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary" id="notifications-mobile-form-item" aria-describedby="notifications-mobile-form-item-description" aria-invalid="false" onClick={() => (mobile = mobile !== true)}>
					@if (mobileOn) {
						<span data-state="checked" data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
					}
				</button>
				<input aria-hidden="true" tabindex="-1" type="checkbox" value="on" checked={mobileOn} style="position: absolute; pointer-events: none; opacity: 0; margin: 0px; transform: translateX(-100%); width: 16px; height: 16px;" />
				<div class="space-y-1 leading-none">
					<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error="false" for="notifications-mobile-form-item">Use different settings for my mobile devices</label>
					<p data-slot="form-description" id="notifications-mobile-form-item-description" class="text-sm text-muted-foreground">
						You can manage your mobile notifications in the <a class="underline decoration-dashed underline-offset-4 hover:decoration-solid active" href="/settings" data-status="active" aria-current="page">mobile settings</a> page.
					</p>
				</div>
			</div>
			<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" type="submit">Update notifications</button>
		</form>
		<Toaster toasts={toasts} extra={true} />
	</SettingsLayout>
}
