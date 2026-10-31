import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

/** What answered an event dispatched on an element of the port. */
export type Answer =
	| { readonly by: 'markless'; readonly where: string }
	| { readonly by: 'site-part' | 'recorded' | 'part'; readonly where: string }
	| { readonly by: 'none' }
	/** A part threw outside a browser: whether it answers is not known, so it is reported, never failed. */
	| { readonly by: 'threw'; readonly where: string; readonly error: string };

// Ports whose answer is the app's own logic as convert recorded or modelled it (a choice's outcome, a played scene, the
// form library's reset, the table's paging), not a UI library's behaviour.
const RECORDED = new Set(['choices', 'scene', 'switch', 'toggle', 'form', 'sonner', 'form-library', 'form-tanstack', 'form-libraries', 'tanstack-table', 'tanstack-tables', 'day-picker', 'react-aria/calendar']);

type Handler = (target: Element, event: Event) => unknown;
interface LoadedPart {
	readonly name: string;
	readonly site: boolean;
	readonly part: Readonly<Record<string, unknown>>;
}

let hooked = false;
// A port's packages (@floating-ui/dom) resolve from the app, else from markless-migrate's own dependencies.
function hookResolve(): void {
	if (hooked) return;
	hooked = true;
	register(new URL('./resolve-hook.ts', import.meta.url));
}

const GLOBALS = ['Node', 'Element', 'HTMLElement', 'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLIFrameElement', 'HTMLDialogElement', 'HTMLFormElement', 'HTMLDetailsElement', 'HTMLImageElement', 'HTMLTemplateElement', 'DocumentFragment', 'Text', 'Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'FocusEvent', 'InputEvent', 'SubmitEvent', 'UIEvent', 'EventTarget', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'location', 'history', 'navigator', 'localStorage', 'sessionStorage', 'ResizeObserver', 'IntersectionObserver', 'CSS', 'DOMParser', 'NodeFilter', 'Range', 'Selection', 'getSelection', 'innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'devicePixelRatio', 'customElements', 'HTMLCollection', 'NodeList', 'DOMRect', 'Animation', 'KeyframeEffect', 'ShadowRoot', 'HTMLSlotElement', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'addEventListener', 'removeEventListener', 'dispatchEvent'];

/**
 * A page of the port in happy-dom with the port's own parts loaded: each event is offered to every part as the parts
 * runtime offers it (parts/index.ts `run`), the site's parts first, and the first that takes it answers.
 */
export class Sandbox {
	window!: Window;
	private readonly loaded = new Map<string, Promise<LoadedPart[]>>();
	private observers = 0;
	private timers = 0;
	private readonly installed = new Set<string>();
	/** Ports that could not be loaded outside a browser, with the error: their events count as unanswered. */
	readonly broken = new Map<string, string>();

	readonly app: string;

	private constructor(app: string) {
		this.app = app;
		this.install();
	}

	// A fresh window per page: what a part kept of the last page (its open layers, timers) goes with that window.
	private install(): void {
		const old = this.window;
		if (old) void old.happyDOM.close().catch(() => {});
		this.window = new Window({ url: 'http://localhost/', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true, navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true } } });
		const w = this.window as unknown as Record<string, unknown>;
		const g = globalThis as unknown as Record<string, unknown>;
		const set = (k: string, v: unknown) => {
			Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
			this.installed.add(k);
		};
		const value = (k: string) => (typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? (w[k] as (...a: unknown[]) => unknown).bind(w) : w[k]);
		set('window', w);
		set('document', this.window.document);
		const names = new Set<string>();
		for (let o: object | null = w; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) names.add(k);
		for (const k of names) if ((this.installed.has(k) || !(k in globalThis)) && k !== 'constructor') set(k, value(k));
		for (const k of GLOBALS) if (w[k] !== undefined) set(k, value(k));
		const setTimer = w.setTimeout as (...a: unknown[]) => unknown;
		set('setTimeout', (...a: unknown[]) => {
			this.timers++;
			return setTimer.apply(w, a);
		});
		const Base = w.MutationObserver as new (cb: MutationCallback) => MutationObserver;
		const self = this;
		set('MutationObserver', class extends Base {
			constructor(cb: MutationCallback) {
				super(cb);
				self.observers++;
			}
		});
		// Chromium iterates a style declaration's property names; happy-dom's declaration has length and item() only.
		const Style = w.CSSStyleDeclaration as { prototype: Record<symbol, unknown> } | undefined;
		if (Style && !Style.prototype[Symbol.iterator]) Style.prototype[Symbol.iterator] = function* (this: { length: number; item(i: number): string }) {
			for (let i = 0; i < this.length; i++) yield this.item(i);
		};
		// A part that fetches a served layer or a table gets nothing; the ledger reads markup, it never serves it.
		const never = () => new Promise(() => {});
		set('fetch', never);
		w.fetch = never;
	}

	static async open(app: string): Promise<Sandbox> {
		hookResolve();
		return new Sandbox(app);
	}

	/** The parts a page's registry lists, imported from the app: `lib/site/parts.ts` first, then the ports in its order. */
	parts(registry: string): Promise<LoadedPart[]> {
		let p = this.loaded.get(registry);
		if (!p) {
			p = (async () => {
				const text = await readFile(join(this.app, registry), 'utf8');
				const out: LoadedPart[] = [];
				const at = posix.dirname(registry);
				if (/import \{ SITE_PARTS \} from '([^']+)'/.test(text)) {
					const from = /import \{ SITE_PARTS \} from '([^']+)'/.exec(text)![1]!;
					const mod = (await import(pathToFileURL(join(this.app, at, from)).href).catch((error: Error) => {
						this.broken.set('site parts', error.message.split('\n')[0]!);
						return undefined;
					})) as { SITE_PARTS: readonly Record<string, unknown>[] } | undefined;
					mod?.SITE_PARTS.forEach((part, i) => out.push({ name: `site part ${i}`, site: true, part }));
				}
				const ports: { name: string; path: string }[] = [];
				for (const m of text.matchAll(/import \* as port\d+ from '([^']+)';/g)) ports.push({ name: posix.normalize(posix.join(at, m[1]!)).replace(/^lib\/parts\//, '').replace(/\.ts$/, ''), path: m[1]! });
				for (const { name, path } of ports.sort((a, b) => a.name.localeCompare(b.name))) {
					const part = (await import(pathToFileURL(join(this.app, at, path)).href).catch((error: Error) => {
						this.broken.set(name, error.message.split('\n')[0]!);
						return undefined;
					})) as Record<string, unknown> | undefined;
					if (part) out.push({ name, site: false, part });
				}
				return out;
			})();
			this.loaded.set(registry, p);
		}
		return p;
	}

	/** Shows `html` as the page's body. */
	show(html: string): void {
		this.install();
		this.window.document.body.innerHTML = html;
	}

	private event(kind: string, target: Element): Event {
		const w = this.window as unknown as Record<string, new (type: string, init: Record<string, unknown>) => Event>;
		const init = { bubbles: true, cancelable: true, composed: true };
		const event = kind === 'keydown' ? new w.KeyboardEvent!(kind, { ...init, key: 'Enter', code: 'Enter' }) : kind === 'input' ? new w.InputEvent!(kind, { ...init, data: 'a', inputType: 'insertText' }) : kind === 'focusin' || kind === 'focusout' ? new w.FocusEvent!(kind, init) : kind === 'submit' ? new w.Event!(kind, init) : new w.PointerEvent!(kind, { ...init, button: 0, buttons: kind === 'pointerdown' ? 1 : 0, pointerType: 'mouse', isPrimary: true });
		Object.defineProperty(event, 'target', { value: target, configurable: true });
		Object.defineProperty(event, 'currentTarget', { value: target, configurable: true });
		return event;
	}

	/** Who answers `kind` on `target`: a Markless handler on it or around it, else the first part that takes it. */
	async answer(target: Element, kind: string, registry: string | undefined, options: { readonly library?: boolean } = {}): Promise<Answer> {
		const own = target.closest(`[data-mm-ledger-on~="${kind}"]`);
		if (own) return { by: 'markless', where: own.getAttribute('data-mm-ledger') ?? '' };
		if (!registry) return { by: 'none' };
		if (kind === 'input' && 'value' in target)
			try {
				(target as HTMLInputElement).value = 'a';
			} catch {}
		const event = this.event(kind, target);
		for (const { name, site, part } of await this.parts(registry)) {
			// Only the site's parts and convert's recordings answer an app's own effect, so the library's ports are not run for one.
			if (!options.library && !site && !RECORDED.has(name)) continue;
			const handler = part[kind] as Handler | undefined;
			if (typeof handler !== 'function') continue;
			const before = this.observers;
			const timers = this.timers;
			const watch = new (this.window as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver(() => {});
			watch?.observe(this.window.document as unknown as Node, { subtree: true, childList: true, attributes: true, characterData: true });
			let took = false;
			try {
				took = handler(target, event) === true;
			} catch (error) {
				watch?.disconnect();
				return { by: 'threw', where: name, error: String(error).split('\n')[0]!.slice(0, 200) };
			}
			const changed = (watch?.takeRecords().length ?? 0) > 0;
			watch?.disconnect();
			// A part that acts without taking the event answers it too: a site part watching what the press changes, a
			// tooltip opening after its delay (a timer), a hover card changing the page.
			const watched = this.observers > before || this.timers > timers;
			if (took || changed || watched) return { by: site ? 'site-part' : RECORDED.has(name) ? 'recorded' : 'part', where: name };
		}
		return { by: 'none' };
	}

	async close(): Promise<void> {
		await this.window.happyDOM.close().catch(() => {});
	}
}

/** The registry module (under the app) whose parts a page module's markup runs. */
export async function registryOf(app: string, page: string): Promise<string | undefined> {
	const text = await readFile(join(app, page), 'utf8').catch(() => '');
	const from = /import \{[^}]*\bbehave\b[^}]*\} from '([^']+)'/.exec(text)?.[1];
	if (!from) return undefined;
	const path = posix.normalize(posix.join(posix.dirname(page), from));
	if (!path.endsWith('/index.ts')) return path;
	const registry = path.replace(/index\.ts$/, 'registry.ts');
	return (await readFile(join(app, registry), 'utf8').then(() => true, () => false)) ? registry : undefined;
}
