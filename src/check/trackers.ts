/** Ad, analytics, tag-manager, session-replay and client-side experiment hosts blocked during checks; a host matches itself and its subdomains. */
export const TRACKER_HOSTS: readonly string[] = [
	// Google tags, ads and analytics
	'googletagmanager.com',
	'google-analytics.com',
	'analytics.google.com',
	'doubleclick.net',
	'googlesyndication.com',
	'googleadservices.com',
	'adservice.google.com',
	'pagead2.googlesyndication.com',
	// Social pixels
	'connect.facebook.net',
	'snap.licdn.com',
	'px.ads.linkedin.com',
	'ads.linkedin.com',
	'analytics.tiktok.com',
	'static.ads-twitter.com',
	'analytics.twitter.com',
	'ads-api.twitter.com',
	'ct.pinterest.com',
	'sc-static.net',
	'bat.bing.com',
	'clarity.ms',
	// Product analytics and session replay
	'segment.com',
	'segment.io',
	'mixpanel.com',
	'amplitude.com',
	'heapanalytics.com',
	'heap.io',
	'hotjar.com',
	'hotjar.io',
	'fullstory.com',
	'logrocket.io',
	'lr-ingest.io',
	'mouseflow.com',
	'posthog.com',
	'i.posthog.com',
	'plausible.io',
	'usefathom.com',
	'simpleanalytics.com',
	'matomo.cloud',
	'quantserve.com',
	'scorecardresearch.com',
	'chartbeat.com',
	'chartbeat.net',
	'parsely.com',
	'newrelic.com',
	'nr-data.net',
	'browser-intake-datadoghq.com',
	'browser-intake-datadoghq.eu',
	// Ad exchanges and retargeting
	'adnxs.com',
	'criteo.com',
	'criteo.net',
	'taboola.com',
	'outbrain.com',
	'amazon-adsystem.com',
	'pubmatic.com',
	'rubiconproject.com',
	'openx.net',
	'moatads.com',
	'adsrvr.org',
	'casalemedia.com',
	'smartadserver.com',
	'yieldmo.com',
	// Tag managers and client-side experiments
	'tags.tiqcdn.com',
	'assets.adobedtm.com',
	'omtrdc.net',
	'demdex.net',
	'cdn.optimizely.com',
	'logx.optimizely.com',
	'dev.visualwebsiteoptimizer.com',
];

export interface BlockList {
	/** Hosts added to the shipped list. */
	readonly add?: readonly string[];
	/** Hosts taken out of the shipped list, so they load. */
	readonly allow?: readonly string[];
}

export function blocker(list: BlockList = {}): (host: string) => boolean {
	const allow = (list.allow ?? []).map((h) => h.toLowerCase());
	const hosts = [...TRACKER_HOSTS, ...(list.add ?? [])].map((h) => h.toLowerCase()).filter((h) => !allow.includes(h));
	const covers = (entry: string, host: string) => host === entry || host.endsWith(`.${entry}`);
	return (host) => {
		const h = host.toLowerCase();
		return hosts.some((entry) => covers(entry, h)) && !allow.some((entry) => covers(entry, h));
	};
}
