import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type Content = Record<string, { news: { title: string; summary: string; slug: string }[]; settings: Record<string, string>; hours: Record<string, string> }>;

export const CONTENT: Content = {
	walks: {
		news: [
			{ title: 'Winter timetable from November', summary: 'Walks start an hour later from the first of November.', slug: 'winter-timetable' },
			{ title: 'New route: Porthgwarra to Land’s End', summary: 'A three-hour walk past the old coastguard lookout.', slug: 'porthgwarra-route' },
		],
		settings: { tagline: 'Walks leave whatever the weather.' },
		hours: { today: 'Booking office open 9:00 to 17:00' },
	},
	coffee: {
		news: [
			{ title: 'Ethiopian lot arrives Tuesday', summary: 'A washed Yirgacheffe with jasmine and bergamot notes.', slug: 'ethiopian-lot' },
			{ title: 'Cupping night every first Friday', summary: 'Taste the week’s roasts with the team after closing.', slug: 'cupping-night' },
		],
		settings: { tagline: 'Roasted by the harbour since 2019.' },
		hours: { today: 'Shop open 8:00 to 16:00' },
	},
};

export interface Cms {
	readonly origin: string;
	/** Requests the CMS answered, as `METHOD /path?query`. */
	readonly requests: string[];
	stop(): Promise<void>;
}

/** A tiny JSON CMS: `/{site}/news?fields=a,b`, `/{site}/articles` (the same list), `/{site}/settings`, `/{site}/hours`. */
export function cmsHandler(content: Content = CONTENT, requests: string[] = []): (req: IncomingMessage, res: ServerResponse) => void {
	return (req, res) => {
		const url = new URL(req.url ?? '/', 'http://cms');
		requests.push(`${req.method} ${url.pathname}${url.search}`);
		const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
		const [, site, collection] = url.pathname.split('/');
		const data = content[site ?? ''];
		if (req.method !== 'GET' || !data) return void res.writeHead(404, headers).end('{"error":"not found"}');
		if (collection === 'news' || collection === 'articles') {
			const fields = url.searchParams.get('fields')?.split(',');
			const items = data.news.map((item) => (fields ? Object.fromEntries(Object.entries(item).filter(([k]) => fields.includes(k))) : item));
			return void res.writeHead(200, headers).end(JSON.stringify({ items }));
		}
		if (collection === 'settings') return void res.writeHead(200, headers).end(JSON.stringify(data.settings));
		if (collection === 'hours' || collection === 'opening-hours') return void res.writeHead(200, headers).end(JSON.stringify(data.hours));
		res.writeHead(404, headers).end('{"error":"not found"}');
	};
}

export async function startCms(content: Content = CONTENT): Promise<Cms> {
	const requests: string[] = [];
	const server: Server = createServer(cmsHandler(content, requests));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('cms has no port');
	return {
		origin: `http://127.0.0.1:${address.port}`,
		requests,
		stop: () => {
			server.closeAllConnections();
			return new Promise((done) => server.close(() => done()));
		},
	};
}

if (import.meta.main) {
	const { origin } = await startCms();
	process.stdout.write(`${origin}\n`);
}
