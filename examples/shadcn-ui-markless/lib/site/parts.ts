import type { Part } from '../parts/index.ts';
import { resolvedTheme, setTheme, type ThemeOptions } from '../parts/next-themes.ts';

// The site's own client components (components/*.tsx in the old app), on Markless: ModeSwitcher and the D shortcut of
// ThemeProvider, CopyButton and CodeBlockCommand's copy. Library behaviour comes from the ports in ../parts.

// components/theme-provider.tsx: <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange enableColorScheme>
const THEME: ThemeOptions = { attribute: 'class', themes: ['light', 'dark'], storageKey: 'theme', defaultTheme: 'system', enableSystem: true, enableColorScheme: true, disableTransitionOnChange: true };
// hooks/use-meta-color.ts
const META_THEME_COLORS = { light: '#ffffff', dark: '#0a0a0a' };

function toggleTheme(): void {
	const next = resolvedTheme(THEME) === 'dark' ? 'light' : 'dark';
	setTheme(next, THEME);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? META_THEME_COLORS.dark : META_THEME_COLORS.light);
}

const isEditable = (t: EventTarget | null) => (t instanceof HTMLElement && t.isContentEditable) || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

// @tabler/icons-react IconCheck and IconCopy, as the old page renders them.
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-check "><path d="M5 12l5 5l10 -10"></path></svg>';
const copied = new WeakMap<Element, { icon: string; timer: number }>();

function legacyCopy(value: string): boolean {
	const area = document.createElement('textarea');
	area.value = value;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.opacity = '0';
	area.style.pointerEvents = 'none';
	document.body.appendChild(area);
	area.focus();
	area.select();
	area.setSelectionRange(0, value.length);
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {}
	document.body.removeChild(area);
	return ok;
}

async function copy(value: string): Promise<boolean> {
	if (!value) return false;
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(value);
			return true;
		} catch {
			return legacyCopy(value);
		}
	}
	return legacyCopy(value);
}

// The copied value is the code the button sits on: the visible block's text, as the old page passed it in.
function valueFor(button: Element): string {
	const scope = button.parentElement;
	const code = [...(scope?.querySelectorAll('pre') ?? [])].find((pre) => !pre.closest('[hidden]')) ?? scope?.querySelector('code');
	return code?.textContent ?? '';
}

function showCopied(button: HTMLElement): void {
	const svg = button.querySelector('svg');
	const was = copied.get(button);
	if (was) clearTimeout(was.timer);
	const icon = was?.icon ?? svg?.outerHTML ?? '';
	if (svg) svg.outerHTML = ICON_CHECK;
	const marks = button.hasAttribute('data-copied');
	if (marks) button.setAttribute('data-copied', 'true');
	const timer = window.setTimeout(() => {
		button.querySelector('svg')!.outerHTML = icon;
		if (marks) button.setAttribute('data-copied', 'false');
		copied.delete(button);
	}, 2000);
	copied.set(button, { icon, timer });
}

const modeSwitcher: Part = {
	click(target) {
		const button = target.closest('button');
		if (!button || button.querySelector('.sr-only')?.textContent !== 'Toggle theme') return false;
		toggleTheme();
		return true;
	},
	keydown(target, event) {
		if ((event.key !== 'd' && event.key !== 'D') || event.metaKey || event.ctrlKey || event.altKey || isEditable(target)) return false;
		event.preventDefault();
		toggleTheme();
		return true;
	},
};

const copyButton: Part = {
	click(target) {
		const button = target.closest<HTMLElement>('[data-slot="copy-button"]');
		if (!button) return false;
		void copy(valueFor(button)).then((ok) => ok && showCopied(button));
		return true;
	},
};

export const SITE_PARTS: readonly Part[] = [modeSwitcher, copyButton];
