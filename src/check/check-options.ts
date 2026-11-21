// The options of `check`, and the part of a kept result's key they make: every option that changes what is checked, by value.
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

export const TIMING_FLAGS = {
	'no-responsiveness': { type: 'boolean' },
	'interaction-budget': { type: 'string' },
	'cpu-throttle': { type: 'string' },
	'network-latency': { type: 'string' },
	'interaction-controls': { type: 'string' },
	'no-motion': { type: 'boolean' },
	'no-embeds': { type: 'boolean' },
	'no-probes': { type: 'boolean' },
	'no-control-parity': { type: 'boolean' },
	'control-webkit': { type: 'boolean' },
	'busy-cpu': { type: 'boolean' },
	'no-behaviours': { type: 'boolean' },
	'no-media': { type: 'boolean' },
	'no-touch': { type: 'boolean' },
	touch: { type: 'string' },
	'no-navigation': { type: 'boolean' },
	'no-load': { type: 'boolean' },
	'load-runs': { type: 'string' },
	'load-cpu': { type: 'string' },
	'psi-key': { type: 'string' },
	'psi-runs': { type: 'string' },
	'no-psi': { type: 'boolean' },
	'slow-network': { type: 'string', multiple: true },
	'slow-network-browser': { type: 'string', multiple: true },
	'slow-network-runs': { type: 'string' },
	'slow-network-control': { type: 'string' },
	'slow-network-concurrency': { type: 'string' },
	'no-slow-network': { type: 'boolean' },
	'no-nav-timing': { type: 'boolean' },
	'nav-timing-runs': { type: 'string' },
	'nav-timing-layouts': { type: 'string' },
	'nav-timing-cell': { type: 'string', multiple: true },
	'nav-timing-cells': { type: 'string' },
	'no-waste': { type: 'boolean' },
	'waste-profile': { type: 'string' },
	'js-budget': { type: 'string' },
	'waste-maps': { type: 'string' },
	reference: { type: 'string', multiple: true },
	'nav-entries': { type: 'string' },
	'nav-destinations': { type: 'string' },
} as const;

export const CHECK_OPTIONS = {
		observations: { type: 'string' },
		original: { type: 'string' },
		old: { type: 'string' },
		new: { type: 'string' },
		route: { type: 'string', multiple: true },
		json: { type: 'boolean' },
		open: { type: 'boolean' },
		source: { type: 'string' },
		'old-hash-routes': { type: 'boolean' },
		data: { type: 'string' },
		'live-window': { type: 'string' },
		staging: { type: 'boolean' },
		block: { type: 'string', multiple: true },
		allow: { type: 'string', multiple: true },
		'no-freeze': { type: 'boolean' },
		'server-clock': { type: 'boolean' },
		time: { type: 'string' },
		seed: { type: 'string' },
		timezone: { type: 'string' },
		locale: { type: 'string' },
		auth: { type: 'string' },
		header: { type: 'string', multiple: true },
		cookie: { type: 'string', multiple: true },
		'user-agent': { type: 'string' },
		all: { type: 'boolean' },
		'allow-unchecked': { type: 'boolean' },
		changed: { type: 'boolean' },
		reuse: { type: 'string' },
		closures: { type: 'string' },
		concurrency: { type: 'string' },
		'new-source': { type: 'string' },
		'journey-budget': { type: 'string' },
		'max-journeys': { type: 'string' },
		'journey-depth': { type: 'string' },
		timeout: { type: 'string' },
		only: { type: 'string' },
		'every-dimension': { type: 'boolean' },
		'no-cache': { type: 'boolean' },
		resume: { type: 'boolean' },
		targets: { type: 'string' },
		'write-targets': { type: 'string' },
		'site-targets': { type: 'string' },
		'layout-survey': { type: 'string' },
		'write-layout-survey': { type: 'string' },
		slices: { type: 'string' },
		'slice-dir': { type: 'string' },
		slice: { type: 'string' },
	...TIMING_FLAGS,
} as const;

/** Options that change nothing a kept result holds, and why. */
export const NOT_CHECKED: Readonly<Record<string, string>> = {
	observations: 'where the rows the check records go',
	json: 'how the report is printed',
	open: 'whether the report is opened',
	reuse: 'where kept results are read and kept',
	closures: "the build's closures, read into the route's own key",
	concurrency: 'how many routes are checked at once',
	targets: "which routes are checked: each route's result is kept under its own key",
	route: "which routes are checked: each route's result is kept under its own key",
	'write-targets': 'writes the targets and checks nothing',
	'write-layout-survey': 'writes the survey and checks nothing',
	resume: 'whether finished routes of a stopped run are read back',
	old: "the old origin: OLD's HTML is in the route's key",
	new: "the new origin: NEW's HTML and files are in the route's key",
	all: 'which routes are checked',
	'allow-unchecked': 'whether routes without a sample fail the run, not any result',
	changed: 'which routes are checked',
	'no-cache': "whether the old side's cache is read",
	slices: 'a sliced route is never kept (check.yml turns --reuse off for its parts)',
	'slice-dir': 'a sliced route is never kept',
	slice: 'a sliced route is never kept',
};

/** Options keyed by whether they are given: a path each job names its own way, whose content is read into the key elsewhere or nowhere yet. */
export const BY_PRESENCE: Readonly<Record<string, string>> = {
	'site-targets': 'groups templates over the whole site',
	'layout-survey': "reads the site's layout owners",
	original: "reads the old side from the original's dataset",
	source: "reads the old app's source",
	'new-source': "reads the new app's source",
	auth: '--reuse refuses --auth',
};

/** Secrets among the options: keyed by a hash of the value, never written out. */
export const SECRET_OPTIONS = new Set(['psi-key', 'header', 'cookie']);

/** The options of a `check` command line that change what is checked, as one key part: what a kept result was checked with. */
export function checkOptionsKey(args: readonly string[]): string {
	const { values } = parseArgs({ args: [...args], options: CHECK_OPTIONS, strict: true, allowPositionals: false });
	const hash = createHash('sha256');
	for (const name of Object.keys(CHECK_OPTIONS).sort()) {
		const value = (values as Record<string, string | boolean | string[] | undefined>)[name];
		if (value === undefined || name in NOT_CHECKED) continue;
		const text = name in BY_PRESENCE ? 'given' : Array.isArray(value) ? value.join('\0') : String(value);
		hash.update(`${name}\0${SECRET_OPTIONS.has(name) ? createHash('sha256').update(text).digest('base64url') : text}\n`);
	}
	return hash.digest('base64url');
}
