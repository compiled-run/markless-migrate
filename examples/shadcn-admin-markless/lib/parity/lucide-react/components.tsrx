// Parity port of lucide-react for /, /users, /sign-in: the 59 icons those routes render, as the old app drew them.
import { computed } from '@markless/core';

export type IconProps = {
	readonly class?: string;
	readonly size?: number;
	readonly 'aria-hidden'?: boolean | 'true' | 'false';
};

export function AlertTriangle({ class: klass, size }: IconProps) @{
	const AlertTriangleClass = computed(() => (klass ? "lucide lucide-triangle-alert " + klass : "lucide lucide-triangle-alert"));
	const AlertTriangleSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={AlertTriangleSize} height={AlertTriangleSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={AlertTriangleClass} aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
}

export function ArrowRight({ class: klass, size }: IconProps) @{
	const ArrowRightClass = computed(() => (klass ? "lucide lucide-arrow-right " + klass : "lucide lucide-arrow-right"));
	const ArrowRightSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ArrowRightSize} height={ArrowRightSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ArrowRightClass} aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
}

export function AudioWaveform({ class: klass, size }: IconProps) @{
	const AudioWaveformClass = computed(() => (klass ? "lucide lucide-audio-waveform " + klass : "lucide lucide-audio-waveform"));
	const AudioWaveformSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={AudioWaveformSize} height={AudioWaveformSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={AudioWaveformClass} aria-hidden="true"><path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" /></svg>
}

export function BadgeCheck({ class: klass, size }: IconProps) @{
	const BadgeCheckClass = computed(() => (klass ? "lucide lucide-badge-check " + klass : "lucide lucide-badge-check"));
	const BadgeCheckSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={BadgeCheckSize} height={BadgeCheckSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={BadgeCheckClass} aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>
}

export function Bell({ class: klass, size }: IconProps) @{
	const BellClass = computed(() => (klass ? "lucide lucide-bell " + klass : "lucide lucide-bell"));
	const BellSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={BellSize} height={BellSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={BellClass} aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>
}

export function Bug({ class: klass, size }: IconProps) @{
	const BugClass = computed(() => (klass ? "lucide lucide-bug " + klass : "lucide lucide-bug"));
	const BugSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={BugSize} height={BugSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={BugClass} aria-hidden="true"><path d="M12 20v-9" /><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" /><path d="M14.12 3.88 16 2" /><path d="M21 21a4 4 0 0 0-3.81-4" /><path d="M21 5a4 4 0 0 1-3.55 3.97" /><path d="M22 13h-4" /><path d="M3 21a4 4 0 0 1 3.81-4" /><path d="M3 5a4 4 0 0 0 3.55 3.97" /><path d="M6 13H2" /><path d="m8 2 1.88 1.88" /><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" /></svg>
}

export function Check({ class: klass, size }: IconProps) @{
	const CheckClass = computed(() => (klass ? "lucide lucide-check " + klass : "lucide lucide-check"));
	const CheckSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={CheckSize} height={CheckSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={CheckClass} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
}

export function CheckIcon({ class: klass, size }: IconProps) @{
	const CheckIconClass = computed(() => (klass ? "lucide lucide-check " + klass : "lucide lucide-check"));
	const CheckIconSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={CheckIconSize} height={CheckIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={CheckIconClass} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
}

export function ChevronDownIcon({ class: klass, size }: IconProps) @{
	const ChevronDownIconClass = computed(() => (klass ? "lucide lucide-chevron-down " + klass : "lucide lucide-chevron-down"));
	const ChevronDownIconSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ChevronDownIconSize} height={ChevronDownIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ChevronDownIconClass} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

export function ChevronRight({ class: klass, size }: IconProps) @{
	const ChevronRightClass = computed(() => (klass ? "lucide lucide-chevron-right " + klass : "lucide lucide-chevron-right"));
	const ChevronRightSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ChevronRightSize} height={ChevronRightSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ChevronRightClass} aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
}

export function ChevronRightIcon({ class: klass, size }: IconProps) @{
	const ChevronRightIconClass = computed(() => (klass ? "lucide lucide-chevron-right " + klass : "lucide lucide-chevron-right"));
	const ChevronRightIconSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ChevronRightIconSize} height={ChevronRightIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ChevronRightIconClass} aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
}

export function ChevronsUpDown({ class: klass, size }: IconProps) @{
	const ChevronsUpDownClass = computed(() => (klass ? "lucide lucide-chevrons-up-down " + klass : "lucide lucide-chevrons-up-down"));
	const ChevronsUpDownSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ChevronsUpDownSize} height={ChevronsUpDownSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ChevronsUpDownClass} aria-hidden="true"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
}

export function CircleCheck({ class: klass, size }: IconProps) @{
	const CircleCheckClass = computed(() => (klass ? "lucide lucide-circle-check " + klass : "lucide lucide-circle-check"));
	const CircleCheckSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={CircleCheckSize} height={CircleCheckSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={CircleCheckClass} aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
}

export function CircleIcon({ class: klass, size }: IconProps) @{
	const CircleIconClass = computed(() => (klass ? "lucide lucide-circle " + klass : "lucide lucide-circle"));
	const CircleIconSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={CircleIconSize} height={CircleIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={CircleIconClass} aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>
}

export function Command({ class: klass, size }: IconProps) @{
	const CommandClass = computed(() => (klass ? "lucide lucide-command " + klass : "lucide lucide-command"));
	const CommandSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={CommandSize} height={CommandSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={CommandClass} aria-hidden="true"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></svg>
}

export function Construction({ class: klass, size }: IconProps) @{
	const ConstructionClass = computed(() => (klass ? "lucide lucide-construction " + klass : "lucide lucide-construction"));
	const ConstructionSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ConstructionSize} height={ConstructionSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ConstructionClass} aria-hidden="true"><rect x="2" y="6" width="20" height="8" rx="1" /><path d="M17 14v7" /><path d="M7 14v7" /><path d="M17 3v3" /><path d="M7 3v3" /><path d="M10 14 2.3 6.3" /><path d="m14 6 7.7 7.7" /><path d="m8 6 8 8" /></svg>
}

export function CreditCard({ class: klass, size }: IconProps) @{
	const CreditCardClass = computed(() => (klass ? "lucide lucide-credit-card " + klass : "lucide lucide-credit-card"));
	const CreditCardSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={CreditCardSize} height={CreditCardSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={CreditCardClass} aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
}

export function Eye({ class: klass, size }: IconProps) @{
	const EyeClass = computed(() => (klass ? "lucide lucide-eye " + klass : "lucide lucide-eye"));
	const EyeSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={EyeSize} height={EyeSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={EyeClass} aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
}

export function EyeOff({ class: klass, size }: IconProps) @{
	const EyeOffClass = computed(() => (klass ? "lucide lucide-eye-off " + klass : "lucide lucide-eye-off"));
	const EyeOffSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={EyeOffSize} height={EyeOffSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={EyeOffClass} aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>
}

export function FileX({ class: klass, size }: IconProps) @{
	const FileXClass = computed(() => (klass ? "lucide lucide-file-x " + klass : "lucide lucide-file-x"));
	const FileXSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={FileXSize} height={FileXSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={FileXClass} aria-hidden="true"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="m14.5 12.5-5 5" /><path d="m9.5 12.5 5 5" /></svg>
}

export function GalleryVerticalEnd({ class: klass, size }: IconProps) @{
	const GalleryVerticalEndClass = computed(() => (klass ? "lucide lucide-gallery-vertical-end " + klass : "lucide lucide-gallery-vertical-end"));
	const GalleryVerticalEndSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={GalleryVerticalEndSize} height={GalleryVerticalEndSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={GalleryVerticalEndClass} aria-hidden="true"><path d="M7 2h10" /><path d="M5 6h14" /><rect width="18" height="12" x="3" y="10" rx="2" /></svg>
}

export function HelpCircle({ class: klass, size }: IconProps) @{
	const HelpCircleClass = computed(() => (klass ? "lucide lucide-circle-question-mark " + klass : "lucide lucide-circle-question-mark"));
	const HelpCircleSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={HelpCircleSize} height={HelpCircleSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={HelpCircleClass} aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
}

export function Laptop({ class: klass, size }: IconProps) @{
	const LaptopClass = computed(() => (klass ? "lucide lucide-laptop " + klass : "lucide lucide-laptop"));
	const LaptopSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={LaptopSize} height={LaptopSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={LaptopClass} aria-hidden="true"><path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z" /><path d="M20.054 15.987H3.946" /></svg>
}

export function LayoutDashboard({ class: klass, size }: IconProps) @{
	const LayoutDashboardClass = computed(() => (klass ? "lucide lucide-layout-dashboard " + klass : "lucide lucide-layout-dashboard"));
	const LayoutDashboardSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={LayoutDashboardSize} height={LayoutDashboardSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={LayoutDashboardClass} aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
}

export function ListTodo({ class: klass, size }: IconProps) @{
	const ListTodoClass = computed(() => (klass ? "lucide lucide-list-todo " + klass : "lucide lucide-list-todo"));
	const ListTodoSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ListTodoSize} height={ListTodoSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ListTodoClass} aria-hidden="true"><path d="M13 5h8" /><path d="M13 12h8" /><path d="M13 19h8" /><path d="m3 17 2 2 4-4" /><rect x="3" y="4" width="6" height="6" rx="1" /></svg>
}

export function Loader({ class: klass, size }: IconProps) @{
	const LoaderClass = computed(() => (klass ? "lucide lucide-loader " + klass : "lucide lucide-loader"));
	const LoaderSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={LoaderSize} height={LoaderSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={LoaderClass} aria-hidden="true"><path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path d="M18 12h4" /><path d="m16.2 16.2 2.9 2.9" /><path d="M12 18v4" /><path d="m4.9 19.1 2.9-2.9" /><path d="M2 12h4" /><path d="m4.9 4.9 2.9 2.9" /></svg>
}

export function Loader2({ class: klass, size }: IconProps) @{
	const Loader2Class = computed(() => (klass ? "lucide lucide-loader-circle " + klass : "lucide lucide-loader-circle"));
	const Loader2Size = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={Loader2Size} height={Loader2Size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={Loader2Class} aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
}

export function Lock({ class: klass, size }: IconProps) @{
	const LockClass = computed(() => (klass ? "lucide lucide-lock " + klass : "lucide lucide-lock"));
	const LockSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={LockSize} height={LockSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={LockClass} aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
}

export function LogIn({ class: klass, size }: IconProps) @{
	const LogInClass = computed(() => (klass ? "lucide lucide-log-in " + klass : "lucide lucide-log-in"));
	const LogInSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={LogInSize} height={LogInSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={LogInClass} aria-hidden="true"><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></svg>
}

export function LogOut({ class: klass, size }: IconProps) @{
	const LogOutClass = computed(() => (klass ? "lucide lucide-log-out " + klass : "lucide lucide-log-out"));
	const LogOutSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={LogOutSize} height={LogOutSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={LogOutClass} aria-hidden="true"><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>
}

export function Mail({ class: klass, size }: IconProps) @{
	const MailClass = computed(() => (klass ? "lucide lucide-mail " + klass : "lucide lucide-mail"));
	const MailSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={MailSize} height={MailSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={MailClass} aria-hidden="true"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" /><rect x="2" y="4" width="20" height="16" rx="2" /></svg>
}

export function MailPlus({ class: klass, size }: IconProps) @{
	const MailPlusClass = computed(() => (klass ? "lucide lucide-mail-plus " + klass : "lucide lucide-mail-plus"));
	const MailPlusSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={MailPlusSize} height={MailPlusSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={MailPlusClass} aria-hidden="true"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="M19 16v6" /><path d="M16 19h6" /></svg>
}

export function Menu({ class: klass, size }: IconProps) @{
	const MenuClass = computed(() => (klass ? "lucide lucide-menu " + klass : "lucide lucide-menu"));
	const MenuSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={MenuSize} height={MenuSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={MenuClass} aria-hidden="true"><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /></svg>
}

export function MessagesSquare({ class: klass, size }: IconProps) @{
	const MessagesSquareClass = computed(() => (klass ? "lucide lucide-messages-square " + klass : "lucide lucide-messages-square"));
	const MessagesSquareSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={MessagesSquareSize} height={MessagesSquareSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={MessagesSquareClass} aria-hidden="true"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" /></svg>
}

export function Monitor({ class: klass, size }: IconProps) @{
	const MonitorClass = computed(() => (klass ? "lucide lucide-monitor " + klass : "lucide lucide-monitor"));
	const MonitorSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={MonitorSize} height={MonitorSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={MonitorClass} aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>
}

export function Moon({ class: klass, size }: IconProps) @{
	const MoonClass = computed(() => (klass ? "lucide lucide-moon " + klass : "lucide lucide-moon"));
	const MoonSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={MoonSize} height={MoonSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={MoonClass} aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg>
}

export function Package({ class: klass, size }: IconProps) @{
	const PackageClass = computed(() => (klass ? "lucide lucide-package " + klass : "lucide lucide-package"));
	const PackageSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={PackageSize} height={PackageSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={PackageClass} aria-hidden="true"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><polyline points="3.29 7 12 12 20.71 7" /><path d="m7.5 4.27 9 5.15" /></svg>
}

export function Palette({ class: klass, size }: IconProps) @{
	const PaletteClass = computed(() => (klass ? "lucide lucide-palette " + klass : "lucide lucide-palette"));
	const PaletteSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={PaletteSize} height={PaletteSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={PaletteClass} aria-hidden="true"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></svg>
}

export function PanelLeftIcon({ class: klass, size }: IconProps) @{
	const PanelLeftIconClass = computed(() => (klass ? "lucide lucide-panel-left " + klass : "lucide lucide-panel-left"));
	const PanelLeftIconSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={PanelLeftIconSize} height={PanelLeftIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={PanelLeftIconClass} aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></svg>
}

export function Plus({ class: klass, size }: IconProps) @{
	const PlusClass = computed(() => (klass ? "lucide lucide-plus " + klass : "lucide lucide-plus"));
	const PlusSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={PlusSize} height={PlusSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={PlusClass} aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
}

export function RotateCcw({ class: klass, size }: IconProps) @{
	const RotateCcwClass = computed(() => (klass ? "lucide lucide-rotate-ccw " + klass : "lucide lucide-rotate-ccw"));
	const RotateCcwSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={RotateCcwSize} height={RotateCcwSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={RotateCcwClass} aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
}

export function SearchIcon({ class: klass, size }: IconProps) @{
	const SearchIconClass = computed(() => (klass ? "lucide lucide-search " + klass : "lucide lucide-search"));
	const SearchIconSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={SearchIconSize} height={SearchIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={SearchIconClass} aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
}

export function Send({ class: klass, size }: IconProps) @{
	const SendClass = computed(() => (klass ? "lucide lucide-send " + klass : "lucide lucide-send"));
	const SendSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={SendSize} height={SendSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={SendClass} aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
}

export function ServerOff({ class: klass, size }: IconProps) @{
	const ServerOffClass = computed(() => (klass ? "lucide lucide-server-off " + klass : "lucide lucide-server-off"));
	const ServerOffSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ServerOffSize} height={ServerOffSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ServerOffClass} aria-hidden="true"><path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5" /><path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z" /><path d="M22 17v-1a2 2 0 0 0-2-2h-1" /><path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z" /><path d="M6 18h.01" /><path d="m2 2 20 20" /></svg>
}

export function Settings({ class: klass, size }: IconProps) @{
	const SettingsClass = computed(() => (klass ? "lucide lucide-settings " + klass : "lucide lucide-settings"));
	const SettingsSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={SettingsSize} height={SettingsSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={SettingsClass} aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>
}

export function Shield({ class: klass, size }: IconProps) @{
	const ShieldClass = computed(() => (klass ? "lucide lucide-shield " + klass : "lucide lucide-shield"));
	const ShieldSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ShieldSize} height={ShieldSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ShieldClass} aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
}

export function ShieldCheck({ class: klass, size }: IconProps) @{
	const ShieldCheckClass = computed(() => (klass ? "lucide lucide-shield-check " + klass : "lucide lucide-shield-check"));
	const ShieldCheckSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={ShieldCheckSize} height={ShieldCheckSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={ShieldCheckClass} aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
}

export function Sparkles({ class: klass, size }: IconProps) @{
	const SparklesClass = computed(() => (klass ? "lucide lucide-sparkles " + klass : "lucide lucide-sparkles"));
	const SparklesSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={SparklesSize} height={SparklesSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={SparklesClass} aria-hidden="true"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" /></svg>
}

export function Sun({ class: klass, size }: IconProps) @{
	const SunClass = computed(() => (klass ? "lucide lucide-sun " + klass : "lucide lucide-sun"));
	const SunSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={SunSize} height={SunSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={SunClass} aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
}

export function Trash2({ class: klass, size }: IconProps) @{
	const Trash2Class = computed(() => (klass ? "lucide lucide-trash2 lucide-trash-2 " + klass : "lucide lucide-trash2 lucide-trash-2"));
	const Trash2Size = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={Trash2Size} height={Trash2Size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={Trash2Class} aria-hidden="true"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
}

export function UserCheck({ class: klass, size }: IconProps) @{
	const UserCheckClass = computed(() => (klass ? "lucide lucide-user-check " + klass : "lucide lucide-user-check"));
	const UserCheckSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={UserCheckSize} height={UserCheckSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={UserCheckClass} aria-hidden="true"><path d="m16 11 2 2 4-4" /><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
}

export function UserCog({ class: klass, size }: IconProps) @{
	const UserCogClass = computed(() => (klass ? "lucide lucide-user-cog " + klass : "lucide lucide-user-cog"));
	const UserCogSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={UserCogSize} height={UserCogSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={UserCogClass} aria-hidden="true"><path d="M10 15H6a4 4 0 0 0-4 4v2" /><path d="m14.305 16.53.923-.382" /><path d="m15.228 13.852-.923-.383" /><path d="m16.852 12.228-.383-.923" /><path d="m16.852 17.772-.383.924" /><path d="m19.148 12.228.383-.923" /><path d="m19.53 18.696-.382-.924" /><path d="m20.772 13.852.924-.383" /><path d="m20.772 16.148.924.383" /><circle cx="18" cy="15" r="3" /><circle cx="9" cy="7" r="4" /></svg>
}

export function UserPen({ class: klass, size }: IconProps) @{
	const UserPenClass = computed(() => (klass ? "lucide lucide-user-pen " + klass : "lucide lucide-user-pen"));
	const UserPenSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={UserPenSize} height={UserPenSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={UserPenClass} aria-hidden="true"><path d="M11.5 15H7a4 4 0 0 0-4 4v2" /><path d="M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" /><circle cx="10" cy="7" r="4" /></svg>
}

export function UserPlus({ class: klass, size }: IconProps) @{
	const UserPlusClass = computed(() => (klass ? "lucide lucide-user-plus " + klass : "lucide lucide-user-plus"));
	const UserPlusSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={UserPlusSize} height={UserPlusSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={UserPlusClass} aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
}

export function UserX({ class: klass, size }: IconProps) @{
	const UserXClass = computed(() => (klass ? "lucide lucide-user-x " + klass : "lucide lucide-user-x"));
	const UserXSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={UserXSize} height={UserXSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={UserXClass} aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" x2="22" y1="8" y2="13" /><line x1="22" x2="17" y1="8" y2="13" /></svg>
}

export function Users({ class: klass, size }: IconProps) @{
	const UsersClass = computed(() => (klass ? "lucide lucide-users " + klass : "lucide lucide-users"));
	const UsersSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={UsersSize} height={UsersSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={UsersClass} aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></svg>
}

export function Wrench({ class: klass, size }: IconProps) @{
	const WrenchClass = computed(() => (klass ? "lucide lucide-wrench " + klass : "lucide lucide-wrench"));
	const WrenchSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={WrenchSize} height={WrenchSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={WrenchClass} aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" /></svg>
}

export function X({ class: klass, size }: IconProps) @{
	const XClass = computed(() => (klass ? "lucide lucide-x " + klass : "lucide lucide-x"));
	const XSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={XSize} height={XSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={XClass} aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
}

export function XIcon({ class: klass, size }: IconProps) @{
	const XIconClass = computed(() => (klass ? "lucide lucide-x " + klass : "lucide lucide-x"));
	const XIconSize = computed(() => size ?? 24);
	<svg xmlns="http://www.w3.org/2000/svg" width={XIconSize} height={XIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={XIconClass} aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
}
