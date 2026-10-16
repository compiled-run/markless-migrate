import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Browser, Locator, Page } from 'playwright';
import { contextOptions, type SideEnv, type StorageState } from './browser.ts';
import { slug } from './data.ts';
import { HINTS } from './hints.ts';
import type { Failure, HttpCapture, LoginResult } from './types.ts';
import { VIEWPORTS } from './types.ts';

export const ANONYMOUS = 'anonymous';

/** A control on the login page: a Playwright selector, or found by its label, placeholder, or role and name. */
export type Target = string | { readonly label: string } | { readonly placeholder: string } | { readonly role: string; readonly name?: string };

/** One step of a login script. Values may read the environment as `${NAME}`, so passwords stay out of the file. */
export type LoginStep =
	| { readonly goto: string }
	| { readonly fill: Target; readonly value: string }
	| { readonly click: Target }
	| { readonly press: string; readonly on?: Target }
	/** A path (`/account`) waits for the URL, anything else for that selector to appear. */
	| { readonly wait: string };

export interface RoleSpec {
	/** A Playwright storage state file, or one per side when the apps live on different hosts. */
	readonly storageState?: string | { readonly old?: string; readonly new?: string };
	/** Runs once per side per check, from a fresh browser, and keeps the cookies and storage it ends with. */
	readonly login?: readonly LoginStep[];
}

export interface AuthFile {
	/** Where a visitor who is not signed in is sent; a route that lands there for one app and not the other is reported as access. */
	readonly loginRoute?: string;
	readonly roles: Readonly<Record<string, RoleSpec>>;
}

export interface AuthConfig extends AuthFile {
	/** Directory the storage state paths are relative to. */
	readonly dir: string;
}

export async function readAuthFile(path: string): Promise<AuthConfig> {
	const file = resolve(path);
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(file, 'utf8'));
	} catch (error) {
		throw new Error(`--auth ${path}: ${(error as Error).message}`);
	}
	return { ...validateAuth(parsed, path), dir: dirname(file) };
}

export function validateAuth(value: unknown, where = 'auth file'): AuthFile {
	const fail = (why: string): never => {
		throw new Error(`${where}: ${why}`);
	};
	if (!value || typeof value !== 'object') fail('expected an object with "roles"');
	const { roles, loginRoute } = value as { roles?: unknown; loginRoute?: unknown };
	if (!roles || typeof roles !== 'object' || !Object.keys(roles).length) fail('"roles" must name at least one role');
	if (loginRoute !== undefined && (typeof loginRoute !== 'string' || !loginRoute.startsWith('/'))) fail('"loginRoute" must be a path starting with /');
	for (const [name, spec] of Object.entries(roles as Record<string, RoleSpec>)) {
		if (name === ANONYMOUS) fail(`"${ANONYMOUS}" is always checked; do not list it as a role`);
		if (!spec || (!spec.storageState && !spec.login?.length)) fail(`role "${name}" needs "storageState" or "login" steps`);
		for (const step of spec.login ?? []) {
			if (!step || typeof step !== 'object' || !['goto', 'fill', 'click', 'press', 'wait'].some((k) => k in step)) fail(`role "${name}" has a step that is not goto, fill, click, press or wait: ${JSON.stringify(step)}`);
		}
	}
	return value as AuthFile;
}

export function interpolate(value: string, env: NodeJS.ProcessEnv = process.env): string {
	return value.replace(/\$\{(\w+)\}/g, (_, name: string) => {
		const v = env[name];
		if (v === undefined) throw new Error(`login script reads \${${name}}, which is not set in the environment`);
		return v;
	});
}

function locate(page: Page, target: Target): Locator {
	if (typeof target === 'string') return page.locator(target);
	if ('label' in target) return page.getByLabel(target.label, { exact: true });
	if ('placeholder' in target) return page.getByPlaceholder(target.placeholder, { exact: true });
	return page.getByRole(target.role as Parameters<Page['getByRole']>[0], target.name ? { name: target.name, exact: true } : {});
}

async function runStep(page: Page, origin: string, step: LoginStep): Promise<void> {
	const timeout = 15_000;
	if ('goto' in step) await page.goto(new URL(interpolate(step.goto), origin).href, { waitUntil: 'load', timeout });
	else if ('fill' in step) await locate(page, step.fill).fill(interpolate(step.value), { timeout });
	else if ('click' in step) await locate(page, step.click).click({ timeout });
	else if ('press' in step) await (step.on ? locate(page, step.on) : page.locator(':focus')).press(step.press, { timeout });
	else if (step.wait.startsWith('/')) {
		const path = interpolate(step.wait);
		await page.waitForURL((url) => url.pathname === path || url.pathname + url.search === path, { timeout });
	} else await page.locator(step.wait).first().waitFor({ timeout });
}

const describeStep = (step: LoginStep) => JSON.stringify(step).replace(/"value":"[^"]*"/, '"value":"…"');

/** Signs in as one role on one app: from its storage state file, or by running its login script in a fresh browser. */
export async function signIn(browser: Browser, env: SideEnv, side: 'old' | 'new', name: string, spec: RoleSpec, dir: string): Promise<StorageState> {
	const file = typeof spec.storageState === 'string' ? spec.storageState : spec.storageState?.[side];
	if (file) return JSON.parse(await readFile(resolve(dir, file), 'utf8')) as StorageState;
	if (!spec.login?.length) throw new Error(`role "${name}" has no storage state for ${side.toUpperCase()} and no login steps`);
	const context = await browser.newContext({ ...contextOptions(VIEWPORTS[0]!, false), ...(env.userAgent ? { userAgent: env.userAgent } : {}) });
	try {
		if (env.cookies?.length) await context.addCookies(env.cookies.map((c) => ({ ...c, url: env.origin })));
		const home = new URL(env.origin).origin;
		if (env.headers) await context.route('**/*', (route) => (new URL(route.request().url()).origin === home ? route.continue({ headers: { ...route.request().headers(), ...env.headers } }) : route.continue()));
		const page = await context.newPage();
		for (const [i, step] of spec.login.entries()) {
			try {
				await runStep(page, env.origin, step);
			} catch (error) {
				throw new Error(`step ${i + 1} ${describeStep(step)} failed at ${page.url()}: ${(error as Error).message.split('\n')[0]}`);
			}
		}
		await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
		return await context.storageState();
	} finally {
		await context.close();
	}
}

/** Writes each signed-in state where a later run, or a person, can point `storageState` at it. */
export async function saveState(dir: string, role: string, side: 'old' | 'new', state: StorageState): Promise<string> {
	await mkdir(dir, { recursive: true });
	const path = join(dir, `${slug(role)}.${side}.json`);
	await writeFile(path, `${JSON.stringify(state, null, '\t')}\n`, { mode: 0o600 });
	return path;
}

type Cookie = StorageState['cookies'][number];

/** The attributes that decide where a cookie is sent and who can read it; values are left out, they are per session. */
export function cookieLine(c: Cookie): string {
	const attrs = [`Path=${c.path}`, c.domain.startsWith('.') ? `Domain=${c.domain}` : 'host-only', c.httpOnly ? 'HttpOnly' : 'readable by scripts', c.secure ? 'Secure' : 'not Secure', `SameSite=${c.sameSite}`, c.expires > 0 ? 'persistent' : 'session'];
	return `${c.name}: ${attrs.join('; ')}`;
}

function cookiesFor(state: StorageState, origin: string): Cookie[] {
	const host = new URL(origin).hostname;
	return state.cookies.filter((c) => host === c.domain.replace(/^\./, '') || host.endsWith(c.domain.startsWith('.') ? c.domain : `.${c.domain}`)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Cookies the role's sign-in left on each app, compared by name and attributes. */
export function compareLogin(role: string, route: string, old: StorageState, next: StorageState, oldOrigin: string, newOrigin: string): LoginResult {
	const a = cookiesFor(old, oldOrigin);
	const b = cookiesFor(next, newOrigin);
	const failures: Failure[] = [];
	const byName = new Map(b.map((c) => [c.name, c]));
	for (const c of a) {
		const other = byName.get(c.name);
		const expected = cookieLine(c);
		const actual = other ? cookieLine(other) : '(not set)';
		if (expected !== actual) failures.push({ route, role, dimension: 'auth', check: `session cookie ${c.name} after signing in as ${role}`, expected, actual, hint: other ? HINTS.cookieAttributes : HINTS.cookieMissing });
	}
	const names = new Set(a.map((c) => c.name));
	for (const c of b) if (!names.has(c.name)) failures.push({ route, role, dimension: 'auth', check: `cookie ${c.name} after signing in as ${role}`, expected: '(not set)', actual: cookieLine(c), hint: HINTS.cookieExtra });
	return { role, ok: failures.length === 0, failures, cookies: { old: a.map(cookieLine), new: b.map(cookieLine) } };
}

const LOGIN_PATH = /(^|\/)(log-?in|sign-?in|sign_in|signin|auth|session\/new|users\/sign_in|account\/login)\/?$/i;

export interface Access {
	readonly allowed: boolean;
	readonly line: string;
}

/** Whether a role got the page: denied when the app answers 401 or 403, or sends the visitor to a login page. */
export function access(http: HttpCapture, loginRoutes: readonly string[]): Access {
	const last = http.chain.at(-1)!;
	const path = new URL(last.url, 'http://x').pathname;
	const toLogin = http.chain.length > 1 && (loginRoutes.some((r) => path === r || path === r.replace(/\/$/, '')) || LOGIN_PATH.test(path));
	const denied = http.status === 401 || http.status === 403 || toLogin;
	const hops = http.chain.length > 1 ? `${http.chain[0]!.status} to ${http.chain.slice(1).map((h) => h.url).join(' to ')} (${last.status})` : `${last.status}`;
	return { allowed: !denied, line: `${denied ? 'denied' : 'let in'}: ${hops}` };
}

/** Access failures for one role on one route: different decisions, or both denied but sent to different places. */
export function accessFailures(route: string, role: string, old: HttpCapture, next: HttpCapture, loginRoutes: readonly string[]): { failures: Failure[]; comparable: boolean } {
	const a = access(old, loginRoutes);
	const b = access(next, loginRoutes);
	if (a.allowed !== b.allowed) {
		return { comparable: false, failures: [{ route, role, dimension: 'auth', check: `access as ${role}`, expected: a.line, actual: b.line, hint: a.allowed ? HINTS.accessDenied : HINTS.accessGranted }] };
	}
	const landing = (h: HttpCapture) => h.chain.at(-1)!.url;
	if (!a.allowed && old.chain.length > 1 && landing(old) !== landing(next)) {
		return { comparable: true, failures: [{ route, role, dimension: 'auth', check: `where ${role} is sent`, expected: landing(old), actual: landing(next), hint: HINTS.loginRedirect }] };
	}
	return { comparable: true, failures: [] };
}

/** Login routes named by the auth file and by each role's script. */
export function loginRoutes(auth: AuthFile): string[] {
	const out = new Set<string>();
	if (auth.loginRoute) out.add(auth.loginRoute);
	for (const spec of Object.values(auth.roles)) {
		const first = spec.login?.find((s): s is { goto: string } => 'goto' in s);
		if (first?.goto.startsWith('/')) out.add(new URL(first.goto, 'http://x').pathname);
	}
	return [...out];
}
