import { computed, state } from '@markless/core';
import { languageLabel } from '../../lib/settings/data.ts';
import { prepare, revalidate, submitForm } from '../../lib/settings/validate.ts';
import { SettingsLayout } from '../../components/settings/settings-layout.tsrx';
import { dateOf, monthShort, monthYear, navRange, nextFocus, shortDate } from '../../lib/parity/react-day-picker/calendar.ts';
import { paintGrid, paintYears } from '../../lib/parity/react-day-picker/paint.ts';
import { menus, PopoverContent } from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import { closeMenu, openMenu, toggleMenu } from '../../lib/parity/radix-ui-react-dropdown-menu/behaviour.ts';
import { chosenIn, filterIn, moveIn } from '../../lib/parity/cmdk/behaviour.ts';
import { focusSoon } from '../../lib/settings/focus.ts';
import { escapeCloses } from '../../lib/settings/popover.ts';
import { DURATION, expired, message, type Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';

const LANG_TRIGGER = "inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 w-50 justify-between";

export default function SettingsAccount() @{
	const m = menus();
	let name = state('');
	let dob = state('');
	let language = state('');
	let errors = state<Record<string, string>>({});
	let submittedOnce = state(false);
	let toasts = state<Toast[]>([]);
	let nowMs = state(Date.now());
	let viewYear = state(new Date().getFullYear());
	let viewMonth = state(new Date().getMonth());
	let focused = state('');
	let lastFocused = state('');
	let crossing = state(false);
	const nameError = computed(() => errors.name ?? '');
	const nameInvalid = computed(() => (errors.name ? 'true' : 'false'));
	const nameDescribed = computed(() => (errors.name ? 'account-name-form-item-description account-name-form-item-message' : 'account-name-form-item-description'));
	const dobError = computed(() => errors.dob ?? '');
	const dobInvalid = computed(() => (errors.dob ? 'true' : 'false'));
	const languageError = computed(() => errors.language ?? '');
	const languageInvalid = computed(() => (errors.language ? 'true' : 'false'));
	const languageDescribed = computed(() => (errors.language ? 'account-language-form-item-description account-language-form-item-message' : 'account-language-form-item-description'));
	const dobEmpty = computed(() => (dob ? 'false' : 'true'));
	const dobText = computed(() => (dob ? shortDate(dob) : 'Pick a date'));
	const dobExpanded = computed(() => (m.open === 'account-dob' ? 'true' : 'false'));
	const dobState = computed(() => (m.open === 'account-dob' ? 'open' : 'closed'));
	const languageText = computed(() => (language ? languageLabel(language) : 'Select language'));
	const languageClass = computed(() => (language ? LANG_TRIGGER : `${LANG_TRIGGER} text-muted-foreground`));
	const languageExpanded = computed(() => (m.open === 'account-language' ? 'true' : 'false'));
	const languageState = computed(() => (m.open === 'account-language' ? 'open' : 'closed'));
	const lang0Check = computed(() => (language === 'en' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang1Check = computed(() => (language === 'fr' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang2Check = computed(() => (language === 'de' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang3Check = computed(() => (language === 'es' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang4Check = computed(() => (language === 'pt' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang5Check = computed(() => (language === 'ru' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang6Check = computed(() => (language === 'ja' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang7Check = computed(() => (language === 'ko' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const lang8Check = computed(() => (language === 'zh' ? 'size-4 opacity-100' : 'size-4 opacity-0'));
	const captionMonth = computed(() => monthShort(viewMonth));
	const captionYear = computed(() => String(viewYear));
	const caption = computed(() => monthYear(viewYear, viewMonth));
	const monthValue = computed(() => String(viewMonth));
	const yearValue = computed(() => String(viewYear));
	// A select's value attribute selects nothing; the chosen option carries selected.
	const month0Selected = computed(() => viewMonth === 0);
	const month1Selected = computed(() => viewMonth === 1);
	const month2Selected = computed(() => viewMonth === 2);
	const month3Selected = computed(() => viewMonth === 3);
	const month4Selected = computed(() => viewMonth === 4);
	const month5Selected = computed(() => viewMonth === 5);
	const month6Selected = computed(() => viewMonth === 6);
	const month7Selected = computed(() => viewMonth === 7);
	const month8Selected = computed(() => viewMonth === 8);
	const month9Selected = computed(() => viewMonth === 9);
	const month10Selected = computed(() => viewMonth === 10);
	const month11Selected = computed(() => viewMonth === 11);
	const atStart = computed(() => viewMonth === 0 && viewYear <= navRange(new Date(nowMs)).startYear);
	const atEnd = computed(() => viewMonth === 11 && viewYear >= navRange(new Date(nowMs)).endYear);
	const prevDisabled = computed(() => (atStart ? 'true' : undefined));
	const prevTab = computed(() => (atStart ? '-1' : undefined));
	const nextDisabled = computed(() => (atEnd ? 'true' : undefined));
	const nextTab = computed(() => (atEnd ? '-1' : undefined));

	<SettingsLayout active="/settings/account" title="Account" desc="Update your account settings. Set your preferred language and timezone.">
		<form
			class="space-y-8"
			novalidate
			onFocusin={() => prepare('account', { name, dob: dob ? dateOf(dob) : undefined, language: language || undefined })}
			onSubmit={async (event) => {
				event.preventDefault();
				submittedOnce = true;
				const { errors: found, json } = await submitForm('account', { name, dob: dob ? dateOf(dob) : undefined, language: language || undefined });
				errors = found;
				if (found.name) {
					document.getElementById('account-name-form-item')?.focus();
					return;
				}
				if (Object.keys(found).length > 0) return;
				const id = `account-${Date.now()}`;
				toasts = message(toasts, id, 'You submitted the following values:', json);
				setTimeout(() => {
					toasts = expired(toasts, id);
				}, DURATION);
			}}
		>
			<div data-slot="form-item" class="grid gap-2">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={nameInvalid} for="account-name-form-item">Name</label>
				<input data-slot="form-control" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40" placeholder="Your name" id="account-name-form-item" aria-describedby={nameDescribed} aria-invalid={nameInvalid} value={name} name="name" onInput={(event) => {
					name = (event.target as HTMLInputElement).value;
					if (submittedOnce) revalidate('account', { name: (event.target as HTMLInputElement).value, dob: dob ? dateOf(dob) : undefined, language: language || undefined }, errors, 'name').then((next) => {
						errors = next;
					});
				}} />
				<p data-slot="form-description" id="account-name-form-item-description" class="text-sm text-muted-foreground">This is the name that will be displayed on your profile and in emails.</p>
				@if (nameError) {
					<p data-slot="form-message" id="account-name-form-item-message" class="text-sm text-destructive">{nameError}</p>
				}
			</div>
			<div data-slot="form-item" class="gap-2 flex flex-col">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={dobInvalid} for="account-dob-form-item">Date of birth</label>
				<button
					el={m.triggers}
					data-slot="popover-trigger"
					class="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3 w-60 justify-start text-start font-normal data-[empty=true]:text-muted-foreground"
					data-empty={dobEmpty}
					type="button"
					aria-haspopup="dialog"
					aria-expanded={dobExpanded}
					aria-controls="radix-menu-account-dob-content"
					data-state={dobState}
					data-menu="account-dob"
					onClick={(event) => {
						m.open = m.open === 'account-dob' ? '' : 'account-dob';
						m.at = '';
						if (m.open === 'account-dob') {
							nowMs = Date.now();
							viewYear = dob ? Number(dob.slice(0, 4)) : new Date(nowMs).getFullYear();
							viewMonth = dob ? Number(dob.slice(5, 7)) - 1 : new Date(nowMs).getMonth();
							focused = '';
							lastFocused = '';
							paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
							paintYears(document.querySelector('#radix-menu-account-dob-content .rdp-years_dropdown'), nowMs, viewYear);
						}
						toggleMenu(m.contents, m.triggers, 'account-dob', m.open === '', event.target, (refocus) => {
							m.open = '';
							closeMenu(m.contents, m.triggers, 'account-dob', refocus);
						});
						if (m.open === 'account-dob') escapeCloses('radix-menu-account-dob-content', () => {
							m.open = '';
							closeMenu(m.contents, m.triggers, 'account-dob', true);
						});
					}}
									>
					<span>{dobText}</span>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar ms-auto h-4 w-4 opacity-50" aria-hidden="true"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>
				</button>
				<p data-slot="form-description" id="account-dob-form-item-description" class="text-sm text-muted-foreground">Your date of birth is used to calculate your age.</p>
				@if (dobError) {
					<p data-slot="form-message" id="account-dob-form-item-message" class="text-sm text-destructive">{dobError}</p>
				}
			</div>
			<div data-slot="form-item" class="gap-2 flex flex-col">
				<label data-slot="form-label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive" data-error={languageInvalid} for="account-language-form-item">Language</label>
				<button
					el={m.triggers}
					data-slot="popover-trigger"
					class={languageClass}
					role="combobox"
					id="account-language-form-item"
					aria-describedby={languageDescribed}
					aria-invalid={languageInvalid}
					type="button"
					aria-haspopup="dialog"
					aria-expanded={languageExpanded}
					aria-controls="radix-menu-account-language-content"
					data-state={languageState}
					data-menu="account-language"
					onClick={(event) => {
						m.open = m.open === 'account-language' ? '' : 'account-language';
						m.at = '';
						toggleMenu(m.contents, m.triggers, 'account-language', m.open === '', event.target, (refocus) => {
							m.open = '';
							closeMenu(m.contents, m.triggers, 'account-language', refocus);
						});
						if (m.open === 'account-language') escapeCloses('radix-menu-account-language-content', () => {
							m.open = '';
							closeMenu(m.contents, m.triggers, 'account-language', true);
						});
					}}
									>
					{languageText}
					<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-2 h-4 w-4 shrink-0 opacity-50"><path d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.35753 11.9939 7.64245 11.9939 7.81819 11.8182L10.0682 9.56819Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
				</button>
				<p data-slot="form-description" id="account-language-form-item-description" class="text-sm text-muted-foreground">This is the language that will be used in the dashboard.</p>
				@if (languageError) {
					<p data-slot="form-message" id="account-language-form-item-message" class="text-sm text-destructive">{languageError}</p>
				}
			</div>
			<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" type="submit">Update account</button>
		</form>
		<PopoverContent menu="account-dob" align="center" class="z-50 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 w-auto p-0">
			<div data-slot="calendar" class="w-fit rdp-root group/calendar bg-background p-3 [--cell-size:--spacing(8)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent rtl:**:[.rdp-button\_next>svg]:rotate-180 rtl:**:[.rdp-button\_previous>svg]:rotate-180" lang="en-US" data-mode="single">
				<div class="relative flex flex-col gap-4 md:flex-row rdp-months">
					<nav class="absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 rdp-nav" aria-label="Navigation bar">
						<button type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 has-[>svg]:px-3 size-(--cell-size) p-0 select-none aria-disabled:opacity-50 rdp-button_previous" aria-label="Go to the Previous Month" aria-disabled={prevDisabled} tabindex={prevTab} onClick={() => {
							if (!atStart) {
								viewYear = viewMonth === 0 ? viewYear - 1 : viewYear;
								viewMonth = viewMonth === 0 ? 11 : viewMonth - 1;
								paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
								paintYears(document.querySelector('#radix-menu-account-dob-content .rdp-years_dropdown'), nowMs, viewYear);
							}
						}}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left size-4 rdp-chevron" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
						<button type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 has-[>svg]:px-3 size-(--cell-size) p-0 select-none aria-disabled:opacity-50 rdp-button_next" aria-label="Go to the Next Month" aria-disabled={nextDisabled} tabindex={nextTab} onClick={() => {
							if (!atEnd) {
								viewYear = viewMonth === 11 ? viewYear + 1 : viewYear;
								viewMonth = viewMonth === 11 ? 0 : viewMonth + 1;
								paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
								paintYears(document.querySelector('#radix-menu-account-dob-content .rdp-years_dropdown'), nowMs, viewYear);
							}
						}}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right size-4 rdp-chevron" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
					</nav>
					<div class="flex w-full flex-col gap-4 rdp-month">
						<div class="flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) rdp-month_caption">
							<div class="flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium rdp-dropdowns">
								<span data-disabled="false" class="relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50 rdp-dropdown_root">
									<select class="absolute inset-0 bg-popover opacity-0 rdp-dropdown rdp-months_dropdown" aria-label="Choose the Month" value={monthValue} onChange={(event) => {
										viewMonth = Number((event.target as HTMLSelectElement).value);
										focused = '';
										paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
									}}><option value="0" selected={month0Selected}>Jan</option><option value="1" selected={month1Selected}>Feb</option><option value="2" selected={month2Selected}>Mar</option><option value="3" selected={month3Selected}>Apr</option><option value="4" selected={month4Selected}>May</option><option value="5" selected={month5Selected}>Jun</option><option value="6" selected={month6Selected}>Jul</option><option value="7" selected={month7Selected}>Aug</option><option value="8" selected={month8Selected}>Sep</option><option value="9" selected={month9Selected}>Oct</option><option value="10" selected={month10Selected}>Nov</option><option value="11" selected={month11Selected}>Dec</option></select>
									<span class="font-medium select-none flex h-8 items-center gap-1 rounded-md ps-2 pe-1 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground rdp-caption_label" aria-hidden="true">{captionMonth}<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 rdp-chevron" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
								</span>
								<span data-disabled="false" class="relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50 rdp-dropdown_root">
									<select class="absolute inset-0 bg-popover opacity-0 rdp-dropdown rdp-years_dropdown" aria-label="Choose the Year" value={yearValue} onChange={(event) => {
										viewYear = Number((event.target as HTMLSelectElement).value);
										focused = '';
										paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
										paintYears(document.querySelector('#radix-menu-account-dob-content .rdp-years_dropdown'), nowMs, viewYear);
									}}></select>
									<span class="font-medium select-none flex h-8 items-center gap-1 rounded-md ps-2 pe-1 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground rdp-caption_label" aria-hidden="true">{captionYear}<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 rdp-chevron" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
								</span>
								<span role="status" aria-live="polite" style="border: 0px; clip: rect(0px, 0px, 0px, 0px); height: 1px; margin: -1px; overflow: hidden; padding: 0px; position: absolute; width: 1px; white-space: nowrap; overflow-wrap: normal;">{caption}</span>
							</div>
						</div>
						<table role="grid" aria-multiselectable="false" aria-label={caption} class="rdp-month_grid">
							<thead aria-hidden="true">
								<tr class="flex rdp-weekdays"><th aria-label="Sunday" class="flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday" scope="col">Su</th><th aria-label="Monday" class="flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday" scope="col">Mo</th><th aria-label="Tuesday" class="flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday" scope="col">Tu</th><th aria-label="Wednesday" class="flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday" scope="col">We</th><th aria-label="Thursday" class="flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday" scope="col">Th</th><th aria-label="Friday" class="flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday" scope="col">Fr</th><th aria-label="Saturday" class="flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none rdp-weekday" scope="col">Sa</th></tr>
							</thead>
							<tbody
								class="rdp-weeks"
								onClick={(event) => {
									event.preventDefault();
									const button = (event.target as Element).closest('button');
									const iso = button?.closest('td')?.dataset.day;
									if (!button || !iso) return;
									focused = iso;
									if (!button.disabled) {
										dob = dob === iso ? '' : iso;
										if (submittedOnce) revalidate('account', { name, dob: dob ? dateOf(dob) : undefined, language: language || undefined }, errors, 'dob').then((next) => {
											errors = next;
										});
									}
									paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
								}}
								onFocusin={(event) => {
									const iso = (event.target as Element).closest('td')?.dataset.day;
									if (!iso) return;
									focused = iso;
									paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
								}}
								onFocusout={() => {
									if (!crossing) lastFocused = focused;
									crossing = false;
									focused = '';
									paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
								}}
								onKeydown={(event) => {
									if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'PageUp' || event.key === 'PageDown' || event.key === 'Home' || event.key === 'End') event.preventDefault();
									const iso = (event.target as Element).closest('td')?.dataset.day;
									const to = iso ? nextFocus(iso, event.key, event.shiftKey, nowMs) : undefined;
									if (to && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
										crossing = Number(to.slice(0, 4)) !== viewYear || Number(to.slice(5, 7)) - 1 !== viewMonth;
										viewYear = Number(to.slice(0, 4));
										viewMonth = Number(to.slice(5, 7)) - 1;
										focused = to;
										paintGrid(document.querySelector('#radix-menu-account-dob-content .rdp-weeks'), { year: viewYear, month: viewMonth, selected: dob, focused, lastFocused, nowMs });
										paintYears(document.querySelector('#radix-menu-account-dob-content .rdp-years_dropdown'), nowMs, viewYear);
										focusSoon(`[data-slot=calendar] td[data-day="${to}"] button`);
									}
								}}
							></tbody>
						</table>
					</div>
				</div>
			</div>
		</PopoverContent>
		<PopoverContent menu="account-language" align="center" class="z-50 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 w-50 p-0">
			<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground" cmdk-root="" id="account-language-command" onKeydown={(event) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
					moveIn(document.getElementById('account-language-command'), event.key);
				}
				const option = event.key === 'Enter' ? chosenIn(document.getElementById('account-language-command')) : undefined;
				if (option) language = option;
			}}>
				<label cmdk-label="" for="account-language-input" id="account-language-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
				<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
					<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search language..." cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="account-language-list" aria-labelledby="account-language-label" id="account-language-input" type="text" value="" onInput={(event) => filterIn(document.getElementById('account-language-command'), (event.target as HTMLInputElement).value)} />
				</div>
				<div data-slot="command-empty" class="py-6 text-center text-sm" cmdk-empty="" role="presentation" hidden>No language found.</div>
				<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="undefined">
					<div cmdk-group-items="" role="group">
						<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="account-language-list" onClick={(event) => {
							const option = chosenIn(document.getElementById('account-language-command'), event.target);
							if (option) language = option;
						}}>
							<div cmdk-list-sizer="">
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-en" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="English" data-option="en">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang0Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									English
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-fr" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="French" data-option="fr">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang1Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									French
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-de" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="German" data-option="de">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang2Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									German
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-es" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Spanish" data-option="es">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang3Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									Spanish
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-pt" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Portuguese" data-option="pt">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang4Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									Portuguese
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-ru" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Russian" data-option="ru">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang5Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									Russian
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-ja" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Japanese" data-option="ja">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang6Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									Japanese
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-ko" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Korean" data-option="ko">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang7Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									Korean
								</div>
								<div data-slot="command-item" class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground" id="account-language-item-zh" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Chinese" data-option="zh">
									<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" class={lang8Check}><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" /></svg>
									Chinese
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</PopoverContent>
		<Toaster toasts={toasts} extra={true} />
	</SettingsLayout>
}
