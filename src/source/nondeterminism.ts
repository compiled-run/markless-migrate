import type { Context } from './context.ts';
import { isConfigFile, isScript, isTestFile } from './files.ts';
import { memberName, parseModule, walk, type Module, type N } from './js.ts';
import { descendants, lineOf, parseTree, type Grammar } from './trees.ts';
import type { Nondeterminism, NondeterminismKind } from './types.ts';

const FLAG_PACKAGES = /^(launchdarkly-|@launchdarkly\/|@growthbook\/|statsig-|@statsig\/|@optimizely\/|flags($|\/)|@vercel\/flags|@unleash\/|unleash-|configcat-|@splitsoftware\/|@harnessio\/ff|flagsmith|@devcycle\/|@openfeature\/|@happykit\/|react-feature-flags)/;
const POSTHOG = /^posthog-(js|node)(\/react)?$/;
const POSTHOG_FLAG = /^(isFeatureEnabled|getFeatureFlag|getFeatureFlagPayload|onFeatureFlags|getAllFlags|reloadFeatureFlags|useFeatureFlagEnabled|useFeatureFlagVariantKey|useFeatureFlagPayload|useActiveFeatureFlags)$/;
const FLAG_METHOD = /^(variation|variationDetail|boolVariation|stringVariation|allFlags|allFlagsState|isOn|isOff|getFeatureValue|evalFeature|checkGate|getExperiment|getConfig|getLayer|decide|activate|getVariation|isFeatureEnabled|getFeatureFlag|isEnabled|getTreatment|getBooleanValue|getStringValue|useFlags|useFlag|useLDClient|useFeatureIsOn|useFeatureValue|useGate|useExperiment|useDecision|useGrowthBook|useFeature)$/;
const ANALYTICS_PACKAGES = /^(@vercel\/analytics|@vercel\/speed-insights|@next\/third-parties\/google|react-ga4?|@segment\/|analytics-node|@rudderstack\/|mixpanel(-browser)?$|@amplitude\/|amplitude-js|react-gtm-module|plausible-tracker|next-plausible|@fullstory\/|react-hotjar|@hotjar\/|@microsoft\/clarity|fathom-client|@heap\/|@sentry\/(browser|nextjs|react|vue)|nuxt-gtag|@nuxtjs\/(gtm|google-analytics)|vue-gtag|@analytics\/|analytics$)/;
const AD_PACKAGES = /^(react-adsense|@ctrl\/react-adsense|react-google-publisher-tag|prebid\.js|@react-gpt\/|react-gpt)/;
const AD_PIXELS = /^(fbq|_fbq|ttq|twq|snaptr|lintrk|rdt|pintrk|uetq|adsbygoogle|googletag)(\.|$)/;
const ANALYTICS_GLOBALS = /^(gtag|ga|dataLayer\.push|_paq\.push|_hsq\.push|plausible|fathom|umami\.track|analytics\.(track|page|identify|group|load)|mixpanel\.\w+|amplitude\.\w+|posthog\.\w+|hj|clarity|heap\.\w+|FS\.\w+|_gaq\.push)$/;

export const AD_HOSTS = /googlesyndication\.com|doubleclick\.net|adservice\.google\.|amazon-adsystem\.com|adnxs\.com|criteo\.(com|net)|taboola\.com|outbrain\.com|carbonads\.(net|com)|ads-twitter\.com|connect\.facebook\.net|analytics\.tiktok\.com|snap\.licdn\.com|sc-static\.net|redditstatic\.com\/ads|pubmatic\.com|rubiconproject\.com|ezojs\.com|mediavine\.com|adthrive\.com|bat\.bing\.com|securepubads\.g\.doubleclick/;
export const ANALYTICS_HOSTS = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|plausible\.io\/js|cdn\.segment\.com|api\.segment\.io|static\.hotjar\.com|script\.hotjar\.com|clarity\.ms|i\.posthog\.com|app\.posthog\.com|cdn\.mxpnl\.com|cdn\.amplitude\.com|js\.hs-scripts\.com|js\.hs-analytics\.net|matomo\.(js|php)|static\.cloudflareinsights\.com|cloud\.umami\.is|cdn\.usefathom\.com|simpleanalyticscdn\.com|cdn\.heapanalytics\.com|edge\.fullstory\.com|cdn\.rudderlabs\.com|cdn\.mouseflow\.com|\/_vercel\/insights\/script\.js|va\.vercel-scripts\.com/;
const HOST_TEXT = /\b(gtag|fbq|ttq|_paq|plausible)\s*\(|dataLayer\s*=|adsbygoogle/;

const RANDOM_IMPORTS: [RegExp, RegExp][] = [
	[/^(node:)?crypto$/, /^(randomUUID|randomBytes|randomInt|randomFillSync|getRandomValues|default|\*)$/],
	[/^nanoid/, /./],
	[/^uuid$/, /^(v1|v4|v6|v7|default|\*)$/],
	[/^@faker-js\//, /./],
	[/^(cuid|@paralleldrive\/cuid2|ulid|shortid)$/, /./],
];
const PERSONAL_IMPORTS: [RegExp, RegExp][] = [
	[/^next\/headers$/, /^(cookies|headers|draftMode)$/],
	[/^(h3|nitropack\/runtime|#imports)$/, /^(getCookie|parseCookies|getHeader|getHeaders|getRequestHeader|getRequestHeaders)$/],
	[/^js-cookie$/, /./],
	[/^(react-cookie|cookies-next|universal-cookie|nookies)$/, /./],
	[/^@vercel\/functions$/, /^(geolocation|ipAddress)$/],
	[/^vinxi\/http$/, /^(getCookie|getHeader|getHeaders|getRequestHeader)$/],
	[/^@tanstack\/(react|solid)-start\/server$/, /^(getCookie|getHeader|getHeaders|getRequestHeader|getWebRequest)$/],
];
const PERSONAL_MEMBER = /(^|\.)(cookies|headers)\.(get|getAll|has|entries|toString)$|(^|\.)(req|request)\.(cookies|headers|signedCookies|geo|ip)$|^Astro\.(cookies|request\.headers|clientAddress|preferredLocale)|^(document\.cookie|navigator\.languages?|navigator\.userAgent|localStorage\.getItem|sessionStorage\.getItem|window\.localStorage\.getItem|window\.sessionStorage\.getItem)$|^(useCookie|useRequestHeaders|useRequestHeader|getCookie|useCookies)$/;

function importKind(source: string, imported: string): NondeterminismKind | undefined {
	if (FLAG_PACKAGES.test(source)) return 'flag';
	if (POSTHOG.test(source)) return POSTHOG_FLAG.test(imported) ? 'flag' : 'analytics';
	if (ANALYTICS_PACKAGES.test(source)) return 'analytics';
	if (AD_PACKAGES.test(source)) return 'ads';
	for (const [s, i] of RANDOM_IMPORTS) if (s.test(source) && i.test(imported)) return 'random';
	for (const [s, i] of PERSONAL_IMPORTS) if (s.test(source) && i.test(imported)) return 'personalisation';
	return undefined;
}

const CLIENT_CALLBACK = /(^|\.)(useEffect|useLayoutEffect|useInsertionEffect|onMounted|onMount|onBeforeMount|afterNextRender|addEventListener|requestAnimationFrame|requestIdleCallback|\$effect|createEffect|onClick)$/;
const SERVER_FILE = /(^|\/)(api|server|middleware)\/|(^|\/)(middleware|proxy|route|serve|server)\.[cm]?[jt]s$|\+(server|page\.server|layout\.server)\.[jt]s$|hooks\.server\.[jt]s$|\.server\.[jt]sx?$/;
const CLIENT_FRAMEWORKS = new Set(['vite', 'vue', 'angular', 'react-router', 'tanstack-router']);

/** Where code at a node runs: from directives, file conventions, and browser-only callbacks around it. */
export function sideOf(mod: Module, node: N, ancestors: readonly N[], framework: string | null): Side {
	const body = mod.program.body as N[];
	if (body.some((s) => s.directive === 'use client')) return 'client';
	if (body.some((s) => s.directive === 'use server') || SERVER_FILE.test(mod.file)) return 'server';
	for (const a of ancestors) if (a.type === 'CallExpression' && CLIENT_CALLBACK.test(memberName(a.callee) ?? '')) return 'client';
	if (mod.file.endsWith('.astro')) {
		const fm = /^\s*---[\s\S]*?\n---/.exec(mod.text);
		return fm && node.start < fm[0].length ? 'server' : 'client';
	}
	if (framework === 'next' && /^(src\/)?app\//.test(mod.file)) return 'server';
	if (framework && CLIENT_FRAMEWORKS.has(framework)) return 'client';
	return 'both';
}

type Side = 'server' | 'client' | 'both';

/** Tags render on the server at most as markup; they fire in the browser, unless the call sits in server-only code. */
function tagSide(mod: Module, node: N, ancestors: readonly N[], framework: string | null): Side {
	const side = sideOf(mod, node, ancestors, framework);
	return side === 'server' && (node.type === 'JSXOpeningElement' || node.type === 'Literal' || node.type === 'TemplateElement' || /\.(astro|vue|svelte)$/.test(mod.file)) ? 'client' : side === 'both' ? 'client' : side;
}

export function scanModule(mod: Module, framework: string | null = null): Nondeterminism[] {
	const out: Nondeterminism[] = [];
	let at: readonly N[] = [];
	const add = (node: N, kind: NondeterminismKind, what: string) => out.push({ file: mod.file, line: mod.line(node.start), kind, what, side: kind === 'ads' || kind === 'analytics' ? tagSide(mod, node, at, framework) : sideOf(mod, node, at, framework) });
	const flagFile = [...mod.imports.values()].some((i) => FLAG_PACKAGES.test(i.source));
	const usedImports = new Set<string>();
	walk(mod.program, (n, ancestors) => {
		at = ancestors;
		if (n.type === 'Literal' && typeof n.value === 'string') {
			if (AD_HOSTS.test(n.value)) add(n, 'ads', n.value.slice(0, 80));
			else if (ANALYTICS_HOSTS.test(n.value)) add(n, 'analytics', n.value.slice(0, 80));
			return;
		}
		if (n.type === 'TemplateElement') {
			const text = n.value.cooked ?? n.value.raw;
			if (AD_HOSTS.test(text)) add(n, 'ads', text.trim().slice(0, 80));
			else if (ANALYTICS_HOSTS.test(text)) add(n, 'analytics', text.trim().slice(0, 80));
			return;
		}
		if (n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier') {
			const imported = mod.imports.get(n.name.name);
			const kind = imported && importKind(imported.source, imported.imported);
			if (kind && kind !== 'random' && kind !== 'personalisation') {
				usedImports.add(n.name.name);
				add(n, kind, `<${n.name.name}>`);
			}
			return;
		}
		if (n.type === 'NewExpression' && memberName(n.callee) === 'Date' && n.arguments.length === 0) return void add(n, 'time', 'new Date()');
		if (n.type === 'MemberExpression') {
			const name = memberName(n)?.replace(/^(window|globalThis|self)\./, '');
			const parent = ancestors.at(-1);
			if (name && PERSONAL_MEMBER.test(name) && !(parent?.type === 'MemberExpression' && parent.object === n && PERSONAL_MEMBER.test(memberName(parent)?.replace(/^(window|globalThis)\./, '') ?? '')) && !(parent?.type === 'AssignmentExpression' && parent.left === n)) {
				if (!(parent?.type === 'CallExpression' && parent.callee === n) || /\.(get|getAll|has|getItem|entries|toString)$/.test(name)) add(n, 'personalisation', name);
			}
			if (name && /^adsbygoogle$|\.adsbygoogle$/.test(name)) add(n, 'ads', 'adsbygoogle');
			return;
		}
		if (n.type !== 'CallExpression') return;
		const raw = memberName(n.callee);
		if (!raw) return;
		const name = raw.replace(/^(window|globalThis|self)\./, '');
		const root = name.split(/[.(]/)[0]!;
		const imported = mod.imports.get(root);
		if (name === 'Date.now' || name === 'performance.now' || name === 'Date' || name.startsWith('Temporal.Now.')) return void add(n, 'time', `${name}()`);
		if (name === 'Math.random' || /^crypto\.(randomUUID|getRandomValues)$/.test(name)) return void add(n, 'random', `${name}()`);
		if (imported) {
			const member = name.includes('.') ? name.split('.').pop()!.replace(/\(\)$/, '') : imported.imported;
			const kind = importKind(imported.source, member) ?? importKind(imported.source, imported.imported);
			if (kind) {
				usedImports.add(root);
				return void add(n, kind, `${name}()`);
			}
		}
		if (mod.bindings.has(root) && !flagFile) return;
		const last = name.split('.').pop()!;
		if (flagFile && FLAG_METHOD.test(last)) return void add(n, 'flag', `${name}()`);
		if (POSTHOG_FLAG.test(last) && /posthog/i.test(name)) return void add(n, 'flag', `${name}()`);
		if (AD_PIXELS.test(name)) return void add(n, 'ads', `${name}()`);
		if (ANALYTICS_GLOBALS.test(name)) return void add(n, 'analytics', `${name}()`);
		if (/^(useCookie|useRequestHeaders?|getCookie|useCookies)$/.test(name) && !imported) return void add(n, 'personalisation', `${name}()`);
	});
	for (const [local, imp] of mod.imports) {
		if (usedImports.has(local)) continue;
		const kind = importKind(imp.source, imp.imported);
		if (kind === 'flag' || kind === 'ads' || kind === 'analytics') out.push({ file: mod.file, line: imp.line, kind, what: `import ${imp.source}`, side: sideOf(mod, mod.program, [], framework) });
	}
	return out;
}

/** Ad and analytics tags in markup: script hosts and inline tag calls, line by line. */
export function scanMarkup(file: string, text: string, side: Side = 'client'): Nondeterminism[] {
	const out: Nondeterminism[] = [];
	const lines = text.split('\n');
	lines.forEach((line, i) => {
		const host = AD_HOSTS.exec(line) ?? ANALYTICS_HOSTS.exec(line);
		if (host) out.push({ file, line: i + 1, kind: AD_HOSTS.test(line) ? 'ads' : 'analytics', what: host[0], side });
		else {
			const call = HOST_TEXT.exec(line);
			if (call) out.push({ file, line: i + 1, kind: /fbq|ttq|adsbygoogle/.test(call[0]) ? 'ads' : 'analytics', what: call[0].replace(/\s*\($/, '()'), side });
		}
	});
	return out;
}

const SERVER_RULES: Record<Grammar, { time: RegExp; random: RegExp; personal: RegExp; flag: RegExp }> = {
	ruby: {
		time: /^(Time\.(now|current)|Time\.zone\.now|Date\.(today|current)|DateTime\.(now|current)|Process\.clock_gettime)$/,
		random: /^(rand|Random\.\w+|SecureRandom\.\w+|Kernel\.rand|\S+\.(sample|shuffle))$/,
		personal: /^(cookies|cookies\.(signed|encrypted)|request\.(headers|user_agent|remote_ip|cookies|location)|session|request\.env)$/,
		flag: /^(Flipper\.enabled\?|Flipper\[\]|\S*ld_client\.variation|LaunchDarkly\S*|Unleash\S*|\S*\.feature_enabled\?)$/,
	},
	php: {
		time: /^(time|date|microtime|now|today|hrtime|Carbon::now|Carbon::today|Date::now|current_time|wp_date|date_i18n|gmdate|strtotime)$/,
		random: /^(rand|mt_rand|random_int|random_bytes|uniqid|wp_rand|wp_generate_password|shuffle|array_rand|str_shuffle|Str::random|Str::uuid|Str::orderedUuid|Uuid::uuid4)$/,
		personal: /^(\$_COOKIE|\$_SERVER|\$_SESSION|\$request->cookie|\$request->header|\$request->userAgent|\$request->ip|request\(\)->cookie|Cookie::get|Request::cookie|Request::header|session|wp_get_current_user|is_user_logged_in|get_current_user_id)$/,
		flag: /^(Feature::active|Feature::for|Feature::value|Pennant::\w+|\$ldClient->variation)$/,
	},
	python: {
		time: /^(datetime\.now|datetime\.datetime\.now|datetime\.utcnow|datetime\.datetime\.utcnow|datetime\.today|date\.today|datetime\.date\.today|timezone\.now|time\.time|time\.monotonic|time\.perf_counter|now)$/,
		random: /^(random\.\w+|uuid\.uuid[14]|uuid[14]|secrets\.\w+|os\.urandom|get_random_string)$/,
		personal: /^(request\.(COOKIES|META|headers|session|user|LANGUAGE_CODE)|request\.COOKIES\.get|request\.META\.get|request\.headers\.get|request\.session\.get)$/,
		flag: /^(flag_is_active|waffle\.flag_is_active|switch_is_active|sample_is_active|\S*ld_client\.variation|posthog\.feature_enabled)$/,
	},
};

/** Clock, random, flag and request reads in Ruby, PHP and Python server code. */
export async function scanServer(grammar: Grammar, file: string, text: string): Promise<Nondeterminism[]> {
	const rules = SERVER_RULES[grammar];
	const out: Nondeterminism[] = [];
	const root = await parseTree(grammar, text);
	const types = grammar === 'ruby' ? ['call', 'element_reference', 'identifier'] : grammar === 'php' ? ['function_call_expression', 'scoped_call_expression', 'member_call_expression', 'variable_name'] : ['call', 'attribute'];
	const seen = new Set<string>();
	for (const node of descendants(root, types)) {
		let name: string;
		if (grammar === 'ruby') {
			if (node.type === 'call') name = `${node.childForFieldName('receiver')?.text ?? ''}${node.childForFieldName('receiver') ? '.' : ''}${node.childForFieldName('method')?.text ?? ''}`;
			else if (node.type === 'element_reference') name = `${node.childForFieldName('object')?.text}${node.childForFieldName('object')?.text === 'Flipper' ? '[]' : ''}`;
			else if (node.parent?.type === 'body_statement' || node.parent?.type === 'argument_list' || node.parent?.type === 'assignment') name = node.text;
			else continue;
		} else if (grammar === 'php') {
			if (node.type === 'function_call_expression') name = node.childForFieldName('function')?.text ?? '';
			else if (node.type === 'scoped_call_expression') name = `${node.childForFieldName('scope')?.text}::${node.childForFieldName('name')?.text}`;
			else if (node.type === 'member_call_expression') name = `${node.childForFieldName('object')?.text}->${node.childForFieldName('name')?.text}`;
			else name = node.text;
		} else {
			if (node.type === 'call') name = node.childForFieldName('function')?.text ?? '';
			else if (node.parent?.type === 'attribute' || (node.parent?.type === 'call' && node.parent.childForFieldName('function')?.startIndex === node.startIndex)) continue;
			else name = node.text;
		}
		const kind: NondeterminismKind | undefined = rules.time.test(name) ? 'time' : rules.random.test(name) ? 'random' : rules.flag.test(name) ? 'flag' : rules.personal.test(name) ? 'personalisation' : undefined;
		if (!kind) continue;
		const line = lineOf(node);
		const key = `${line}:${kind}:${name}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ file, line, kind, what: name, side: 'server' });
	}
	return out;
}

/**
 * Template expressions (`{expr}` in Svelte and Astro, `{{ expr }}` and `:attr="expr"` in Vue) as one script with
 * everything else blanked, so offsets and lines still match the file.
 */
export function templateScript(file: string, template: string): string {
	const out = template.replace(/[^\n]/g, ' ').split('');
	const keep = (from: number, to: number) => {
		out[from - 1] = ';';
		for (let i = from; i < to; i++) out[i] = template[i]!;
		out[to] = ';';
	};
	if (file.endsWith('.vue')) {
		for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) keep(m.index! + 2, m.index! + 2 + m[1]!.length);
		for (const m of template.matchAll(/\s(?::|v-bind:|v-if=|v-show=|v-html=)[\w-]*="([^"]*)"/g)) {
			const start = m.index! + m[0].length - m[1]!.length - 1;
			keep(start, start + m[1]!.length);
		}
		return out.join('');
	}
	let depth = 0;
	let start = -1;
	for (let i = 0; i < template.length; i++) {
		const ch = template[i];
		if (ch === '{') {
			if (depth === 0) start = i + 1;
			depth++;
		} else if (ch === '}' && depth > 0 && --depth === 0) {
			if (!/^\s*[#/:@]/.test(template.slice(start, i))) keep(start, i);
		}
	}
	return out.join('');
}

const SERVER_SKIP = /(^|\/)(migrations?|db|config|spec|tests?|vendor|database|bin|scripts?)\//;

export async function scanNondeterminism(ctx: Context, framework: string | null): Promise<Nondeterminism[]> {
	const out: Nondeterminism[] = [];
	for (const file of ctx.project.files) {
		if (isTestFile(file) || isConfigFile(file)) continue;
		if (isScript(file)) {
			const mod = await ctx.module(file);
			if (!mod) continue;
			out.push(...scanModule(mod, framework));
			if (mod.template) {
				out.push(...scanMarkup(file, mod.template));
				if (/\.(vue|svelte|astro)$/.test(file)) {
					const expressions = parseModule(`${file}.tsx`, templateScript(file, mod.template));
					out.push(...scanModule({ ...expressions, file, imports: mod.imports, bindings: mod.bindings }, framework).filter((x) => !x.what.startsWith('import ')).map((x) => ({ ...x, side: file.endsWith('.astro') ? 'server' : x.side })));
				}
			}
		} else if (/\.(html?|erb|hbs|njk|liquid|twig|blade\.php)$/.test(file)) {
			const text = await ctx.project.read(file);
			out.push(...scanMarkup(file, text));
			if (/\.html?$/.test(file) && /<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) {
				const mod = await ctx.module(file).catch(() => undefined);
				if (mod) out.push(...scanModule(mod, 'vite').filter((x) => x.kind === 'time' || x.kind === 'random' || x.kind === 'personalisation'));
			}
		}
		const grammar: Grammar | undefined = file.endsWith('.rb') ? 'ruby' : file.endsWith('.php') ? 'php' : file.endsWith('.py') ? 'python' : undefined;
		if (grammar && !SERVER_SKIP.test(file) && !/(^|\/)settings(\/|\.py$)|manage\.py$|wsgi\.py$|asgi\.py$/.test(file)) {
			const text = await ctx.project.read(file);
			out.push(...(await scanServer(grammar, file, text)));
			if (grammar === 'php') out.push(...scanMarkup(file, text));
		}
	}
	const seen = new Set<string>();
	return out.filter((x) => {
		const key = `${x.file}:${x.line}:${x.kind}:${x.what}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

