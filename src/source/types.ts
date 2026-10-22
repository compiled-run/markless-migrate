export interface Location {
	readonly file: string;
	readonly line: number;
}

export interface SourceRoute {
	/** Normalised pattern: `:name` one segment, `:name?` optional, `*name` one or more, `*name?` zero or more. */
	path: string;
	file: string;
	line: number;
	dynamic: boolean;
	auth?: string[];
	kind: 'page' | 'endpoint';
	methods?: string[];
	/** Modules the page loads that a bundler builds from (webpack entries): what they render is this page's. */
	entries?: string[];
}

export type NondeterminismKind = 'time' | 'random' | 'flag' | 'ads' | 'analytics' | 'personalisation';

export interface Nondeterminism {
	file: string;
	line: number;
	kind: NondeterminismKind;
	/** What was read or called, e.g. `Date.now()` or `posthog.isFeatureEnabled`. */
	what: string;
	/** Where the code runs, as far as file conventions, directives and surrounding callbacks tell. */
	side: 'server' | 'client' | 'both';
}

export interface Write {
	method: string;
	path: string | null;
	handler: Location;
	via: 'form' | 'server-action' | 'route-handler' | 'route' | 'fetch' | 'sdk' | 'graphql-mutation';
	/** Database and payment SDKs the handler reaches, directly or through functions it calls. */
	touches?: string[];
}

export interface Client {
	kind: string;
	file: string;
	line: number;
	queries?: string[];
	fields?: string[];
	/** Base URL or the environment variable that holds it, when visible. */
	base?: string;
	/** Where the request is actually sent when this entry is the call site of a wrapper around it. */
	via?: Location;
}

export interface AuthGuard {
	role: string | null;
	file: string;
	line: number;
	routes: string[];
	/** Write endpoints the guard also covers, as `METHOD path`, when they are not routes a browser can load. */
	writes?: string[];
	how: string;
	/** Where an unauthenticated visitor is sent, when visible: the login route to script. */
	redirectTo?: string;
}

export interface Component {
	name: string;
	file: string;
	line: number;
	/** Ids (`file#Name`) of the components that render this one. */
	usedBy: string[];
	id: string;
	kind: 'component' | 'layout' | 'route';
	/** Ids of the components this one renders. */
	uses: string[];
}

export interface SourceFacts {
	framework: string | null;
	routes: SourceRoute[];
	nondeterminism: Nondeterminism[];
	writes: Write[];
	clients: Client[];
	authGuards: AuthGuard[];
	components: Component[];
	/** What this scan could not read, so a short list is not taken as complete. */
	limits: string[];
	/** Redirects the app declares in its config. */
	redirects?: Redirect[];
}

export interface Redirect {
	from: string;
	to: string;
	file: string;
	line: number;
	/** A rewrite serves `to` at `from` without the browser seeing it; a redirect answers 308 (permanent) or 307. */
	kind?: 'redirect' | 'rewrite';
	permanent?: boolean;
}

export interface PlanStep {
	kind: 'component' | 'layout' | 'route';
	id: string;
	name: string;
	file: string;
	/** How many components depend on this one, directly or not. */
	unlocks: number;
}
