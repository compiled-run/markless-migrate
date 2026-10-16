import { access, writeFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import type { AuthFile, LoginStep, Target } from '../check/auth.ts';
import type { AuthGuard, SourceRoute } from '../source/index.ts';
import type { RouteUnionEntry } from './source.ts';

const LOGIN = /(^|\/)(log-?in|sign-?in|sign_in|signin)\/?$/i;
const SIGNED_IN = 'signed-in';

export interface ProposedAuth extends AuthFile {
	readonly note: string;
	/** Each guarded route with the role it asks for and where the guard is: `/admin: admin (middleware.ts:28)`. */
	readonly guards: readonly string[];
}

/** A pattern made concrete with a crawled sample of its longest dynamic prefix: `/:lang/login` becomes `/en/login`. */
export function concrete(pattern: string, union: readonly RouteUnionEntry[], prefer?: string): string {
	if (!pattern.includes(':') && !pattern.includes('*')) return pattern;
	const parts = pattern.split('/');
	for (let n = parts.length - 1; n > 1; n--) {
		const prefix = parts.slice(0, n).join('/');
		const samples = union.find((u) => u.route === prefix)?.crawled ?? [];
		const sample = (prefer && samples.includes(prefer) ? prefer : samples[0]) ?? undefined;
		if (sample && !parts.slice(n).some((p) => p.startsWith(':') || p.startsWith('*'))) return `${sample}/${parts.slice(n).join('/')}`;
	}
	return pattern;
}

/** Roles and the login route from the source scan's auth guards; undefined when it found none. */
export function proposeAuth(guards: readonly AuthGuard[], routes: readonly SourceRoute[], union: readonly RouteUnionEntry[], home?: string): ProposedAuth | undefined {
	if (!guards.length) return undefined;
	const named = [...new Set(guards.map((g) => g.role).filter((r): r is string => Boolean(r)))].sort();
	const roles = [SIGNED_IN, ...named.filter((r) => r !== SIGNED_IN)];
	const target = guards.find((g) => g.redirectTo)?.redirectTo ?? routes.find((r) => r.kind === 'page' && LOGIN.test(r.path))?.path;
	const loginRoute = target ? concrete(target, union, home) : undefined;
	const guarded = guards.flatMap((g) => g.routes.map((r) => `${concrete(r, union, home)}: ${g.role ?? SIGNED_IN} (${g.file}:${g.line})`));
	const env = (role: string) => role.toUpperCase().replace(/\W+/g, '_');
	return {
		note: 'Starter written by plan from the auth guards in the source. Set each role\'s credentials in the environment (never in this file), check the login steps against the login page, then pass this file to check --auth. A role can use "storageState": "file.json" instead of "login".',
		...(loginRoute ? { loginRoute } : {}),
		roles: Object.fromEntries(roles.map((role) => [role, { login: [{ goto: loginRoute ?? '/login' }, { fill: { label: 'Email' }, value: `\${${env(role)}_EMAIL}` }, { fill: { label: 'Password' }, value: `\${${env(role)}_PASSWORD}` }, { click: { role: 'button', name: 'Sign in' } }, { wait: `!${loginRoute ?? '/login'}` }] as LoginStep[] }])),
		guards: guarded,
	};
}

/** The login form's fields as the page labels them, so the starter's steps fit the real page. */
export async function readLoginForm(browser: Browser, url: string): Promise<{ user?: Target; password?: Target; submit?: Target } | undefined> {
	const page = await browser.newPage();
	try {
		const response = await page.goto(url, { waitUntil: 'load', timeout: 15_000 });
		if (!response?.ok()) return undefined;
		return await page.evaluate(() => {
			const password = document.querySelector<HTMLInputElement>('input[type="password"]');
			const form = password?.form;
			if (!password || !form) return undefined;
			const name = (el: HTMLInputElement | HTMLButtonElement) => (el.labels?.[0]?.textContent ?? '').replace(/\s+/g, ' ').trim() || el.getAttribute('aria-label') || '';
			const inputs = [...form.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="submit"])')];
			const user = inputs.find((i) => i.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING);
			const submit = form.querySelector<HTMLButtonElement>('button:not([type="button"]), input[type="submit"]');
			const target = (el: HTMLInputElement | undefined) => (el ? (name(el) ? { label: name(el) } : el.placeholder ? { placeholder: el.placeholder } : { label: el.name }) : undefined);
			const button = submit ? (submit.textContent ?? '').trim() || (submit as unknown as HTMLInputElement).value : '';
			return { user: target(user), password: target(password), submit: button ? { role: 'button', name: button } : undefined };
		});
	} catch {
		return undefined;
	} finally {
		await page.close();
	}
}

export function withLoginForm(proposed: ProposedAuth, form: Awaited<ReturnType<typeof readLoginForm>>): ProposedAuth {
	if (!form) return proposed;
	const roles = Object.fromEntries(
		Object.entries(proposed.roles).map(([role, spec]) => [
			role,
			{
				login: (spec.login ?? []).map((step) => {
					if ('fill' in step && /_EMAIL\}$/.test(step.value) && form.user) return { ...step, fill: form.user };
					if ('fill' in step && /_PASSWORD\}$/.test(step.value) && form.password) return { ...step, fill: form.password };
					if ('click' in step && form.submit) return { click: form.submit };
					return step;
				}),
			},
		]),
	);
	return { ...proposed, roles };
}

/** Writes the starter unless a file is already there: it holds the user's own edits. */
export async function writeStarterAuth(path: string, proposed: ProposedAuth): Promise<boolean> {
	if (await access(path).then(() => true, () => false)) return false;
	await writeFile(path, `${JSON.stringify(proposed, null, '\t')}\n`);
	return true;
}
