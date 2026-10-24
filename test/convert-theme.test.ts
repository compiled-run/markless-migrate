import assert from 'node:assert/strict';
import { test } from 'node:test';
import { earlyThemeScript, handledEarly } from '../parts/next-themes.ts';
import { nextThemesOptions, themeToggleOf } from '../src/convert/theme.ts';

// next-themes 0.4's inline script as ui.shadcn.com's ThemeProvider writes it.
const SCRIPT = `((a,b,c,d,e,f,g,h)=>{let i=document.documentElement,j=["light","dark"];function k(b){var c;(Array.isArray(a)?a:[a]).forEach(a=>{let c="class"===a,d=c&&f?e.map(a=>f[a]||a):e;c?(i.classList.remove(...d),i.classList.add(f&&f[b]?f[b]:b)):i.setAttribute(a,b)}),c=b,h&&j.includes(c)&&(i.style.colorScheme=c)}if(d)k(d);else try{let a=localStorage.getItem(b)||c,d=g&&"system"===a?window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":a;k(d)}catch(a){}})("class","theme","system",null,["light","dark"],null,true,true)`;

test("next-themes' options come from the inline script its ThemeProvider writes", () => {
	assert.deepEqual(nextThemesOptions(SCRIPT, true), { attribute: 'class', storageKey: 'theme', defaultTheme: 'system', themes: ['light', 'dark'], enableSystem: true, enableColorScheme: true, disableTransitionOnChange: true });
	assert.equal(nextThemesOptions(SCRIPT.replace('"system",null,', '"system","dark",')), undefined, 'a forced theme is no toggle');
	assert.equal(nextThemesOptions('console.log(1)'), undefined);
});

test('the site names its toggle in controls.json', () => {
	assert.deepEqual(themeToggleOf([{ selector: 'button', action: 'click' }, { action: 'theme', name: 'Toggle theme', key: 'd' }]), { action: 'theme', name: 'Toggle theme', key: 'd' });
	assert.equal(themeToggleOf([{ selector: 'button', action: 'click' }]), undefined);
});

test('the inline toggle switches the theme in the click and marks the event, so the part does not switch it back', () => {
	const listeners: Record<string, (event: unknown) => void> = {};
	const classes = new Set(['light']);
	const store = new Map<string, string>();
	const button = { closest: () => button, getAttribute: () => null, textContent: ' Toggle theme ' };
	class FakeElement {}
	Object.setPrototypeOf(button, FakeElement.prototype);
	const root = { classList: { remove: (...n: string[]) => n.forEach((c) => classes.delete(c)), add: (c: string) => classes.add(c) }, style: {} as Record<string, string>, setAttribute() {} };
	const scope = {
		document: { documentElement: root, addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn), querySelector: () => null, createElement: () => ({ remove() {} }), head: { appendChild() {} }, body: {} },
		localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
		matchMedia: () => ({ matches: false }),
		getComputedStyle: () => ({}),
		setTimeout: (fn: () => void) => fn(),
		Element: FakeElement,
		HTMLElement: class {},
		HTMLInputElement: class {},
		HTMLTextAreaElement: class {},
		HTMLSelectElement: class {},
	};
	const script = earlyThemeScript({ attribute: 'class', storageKey: 'theme', defaultTheme: 'system', themes: ['light', 'dark'], enableSystem: true, enableColorScheme: true, disableTransitionOnChange: false }, { name: 'Toggle theme', key: 'D' });
	new Function(...Object.keys(scope), script)(...Object.values(scope));
	const click = { target: button };
	listeners.click!(click);
	assert.deepEqual([...classes], ['dark']);
	assert.equal(store.get('theme'), 'dark');
	assert.equal(root.style.colorScheme, 'dark');
	assert.equal(handledEarly(click as unknown as Event), true);
	listeners.click!({ target: button });
	assert.deepEqual([...classes], ['light'], 'the second click switches back');
	let prevented = false;
	listeners.keydown!({ key: 'd', target: null, preventDefault: () => (prevented = true) });
	assert.deepEqual([...classes], ['dark'], 'the D shortcut, the key matched case-insensitively');
	assert.ok(prevented);
});
