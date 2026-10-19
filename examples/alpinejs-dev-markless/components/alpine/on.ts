// Alpine.js's x-on modifiers (MIT, Caleb Porzio).
import { isShown } from './show.ts';

const NON_KEY = ['window', 'document', 'prevent', 'stop', 'once', 'capture', 'self', 'away', 'outside', 'passive', 'dot', 'camel', 'preserve-scroll', 'blur', 'change', 'lazy', 'number', 'boolean', 'trim', 'fill', 'unintrusive', 'parent'];
const KEY_ALIASES: Record<string, string> = { ctrl: 'control', slash: '/', space: ' ', spacebar: ' ', cmd: 'meta', esc: 'escape', up: 'arrow-up', down: 'arrow-down', left: 'arrow-left', right: 'arrow-right', period: '.', comma: ',', equal: '=', minus: '-', underscore: '_' };

const isNumeric = (subject: string) => !Number.isNaN(Number(subject));
const isKeyEvent = (event: string) => event === 'keydown' || event === 'keyup';
const isClickEvent = (event: string) => ['contextmenu', 'click', 'mouse'].some((i) => event.includes(i));

function kebab(subject: string): string {
	if ([' ', '_'].includes(subject)) return subject;
	return subject.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[_\s]/, '-').toLowerCase();
}

function keyToModifiers(key: string | undefined): string[] {
	if (!key) return [];
	const name = kebab(key);
	const map: Record<string, string> = { ...KEY_ALIASES, [name]: name };
	return Object.keys(map).filter((modifier) => map[modifier] === name);
}

function wrongKey(e: KeyboardEvent & MouseEvent, modifiers: readonly string[]): boolean {
	let keys = modifiers.filter((m, i) => !(m === 'false' && modifiers[i - 1] === 'passive') && !NON_KEY.includes(m));
	for (const timed of ['debounce', 'throttle']) {
		if (keys.includes(timed)) {
			const at = keys.indexOf(timed);
			keys.splice(at, isNumeric((keys[at + 1] || 'invalid-wait').split('ms')[0]!) ? 2 : 1);
		}
	}
	if (keys.length === 0) return false;
	if (keys.length === 1 && keyToModifiers(e.key).includes(keys[0]!)) return false;
	const system = ['ctrl', 'shift', 'alt', 'meta', 'cmd', 'super'].filter((m) => keys.includes(m));
	keys = keys.filter((k) => !system.includes(k));
	if (system.length > 0) {
		const pressed = system.filter((m) => (e as unknown as Record<string, boolean>)[`${m === 'cmd' || m === 'super' ? 'meta' : m}Key`]);
		if (pressed.length === system.length) {
			if (isClickEvent(e.type)) return false;
			if (keyToModifiers(e.key).includes(keys[0]!)) return false;
		}
	}
	return true;
}

/** Whether a listener with these modifiers runs for this event; applies .prevent and .stop when it does. */
export function passes(event: Event, el: Element | undefined, modifiers: readonly string[]): boolean {
	if (modifiers.includes('self') && event.target !== el) return false;
	if ((isKeyEvent(event.type) || isClickEvent(event.type)) && wrongKey(event as KeyboardEvent & MouseEvent, modifiers)) return false;
	if (modifiers.includes('prevent')) event.preventDefault();
	if (modifiers.includes('stop')) event.stopPropagation();
	return true;
}

/** A listener the element's own event props cannot express: .window, .document, .outside, or an event of the page's own. */
export function listen(el: HTMLElement | undefined, event: string, modifiers: readonly string[], handler: (event: Event) => void): () => void {
	if (!el) return () => {};
	let target: EventTarget = el;
	if (modifiers.includes('window')) target = window;
	if (modifiers.includes('document')) target = document;
	const outside = modifiers.includes('outside') || modifiers.includes('away');
	if (outside) target = document;
	const options: AddEventListenerOptions = {};
	if (modifiers.includes('capture')) options.capture = true;
	if (modifiers.includes('passive')) options.passive = modifiers[modifiers.indexOf('passive') + 1] !== 'false';
	const wrapped = (e: Event) => {
		if (!el.isConnected) return target.removeEventListener(event, wrapped, options);
		if (outside) {
			const node = e.target as Node;
			if (el.contains(node) || (node as Node & { isConnected?: boolean }).isConnected === false) return;
			if (el.offsetWidth < 1 && el.offsetHeight < 1) return;
			if (!isShown(el)) return;
		}
		if (!passes(e, el, modifiers)) return;
		handler(e);
		if (modifiers.includes('once')) target.removeEventListener(event, wrapped, options);
	};
	target.addEventListener(event, wrapped, options);
	return () => target.removeEventListener(event, wrapped, options);
}

/** $dispatch: a bubbling, composed CustomEvent from the element the expression sits on. */
export function dispatch(el: HTMLElement | undefined, name: string, detail?: unknown): boolean {
	return !!el?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true }));
}

const started = new WeakSet<Element>();

/** Runs a demo's setup once, on the first event that can precede using it. */
export function setup(el: Element | undefined, start: () => void): void {
	if (!el || started.has(el)) return;
	started.add(el);
	start();
}
