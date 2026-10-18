// One function per htmx.org Zola template (www/themes/htmx-theme/templates and www/templates): each writes what its
// Tera template puts inside <main>, around the page's rendered markdown. base.html's header and footer are
// components/site-header.tsrx and components/site-footer.tsrx.

export interface ListedPage {
	readonly title: string;
	readonly permalink: string;
	readonly date: string;
}

export interface Meta {
	readonly template: string;
	readonly kind: 'page' | 'section';
	readonly title: string;
	readonly description: string;
	readonly date: string;
	readonly authors: readonly string[];
	readonly extra: Record<string, unknown>;
	readonly path: string;
	readonly pages?: readonly ListedPage[];
	readonly posts?: readonly ListedPage[];
	readonly podcasts?: readonly (readonly string[])[];
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function formatDate(iso: string, long: boolean): string {
	const [y, m, d] = iso.split('-');
	const month = MONTHS[Number(m) - 1]!;
	return `${long ? month : month.slice(0, 3)} ${d}, ${y}`;
}
const flag = (meta: Meta, key: string) => (meta.extra[key] === undefined ? true : meta.extra[key] !== false);
const trailer = '<div style="padding-top: 120px;padding-bottom:40px;text-align: center">&lt;/&gt;</div>';
const LIST_STYLE = '<style>\nol { list-style-type: none; margin: 0; }\ntime { padding-right: 10px; }\n</style>';
const anchorHeading = (tag: string, id: string, text: string, mark: string) => `<${tag} id="${id}">\n<a class="zola-anchor" href="#${id}" aria-label="Anchor link for: ${id}">${mark}</a>${text}\n</${tag}>`;

export const TEMPLATES: Record<string, (meta: Meta, content: string) => string> = {
	index: (_meta, content) => content,
	page(meta, content) {
		const title = meta.path.startsWith('/attributes') ? `<code>${meta.title}</code>` : meta.title;
		return `${flag(meta, 'show_title') ? `<h1>${title}</h1>\n` : ''}${content}`;
	},
	section: (meta, content) => `${flag(meta, 'show_title') ? `<h1>${meta.title}</h1>\n` : ''}${content}`,
	demo: (meta, content) =>
		`${flag(meta, 'show_title') ? `<h1>${meta.title}</h1>\n` : ''}<script src="https://cdn.jsdelivr.net/npm/sinon@9.0.2/pkg/sinon.js"></script>\n<script src="/js/demo.js"></script>\n${content}`,
	essay(meta, content) {
		const byline = flag(meta, 'show_author') && meta.authors.length > 0 ? `<address>${esc(meta.authors.join(', '))}</address>\n<time>${formatDate(meta.date, true)}</time>\n` : '';
		return `${flag(meta, 'show_title') ? `<h1>${meta.title}</h1>\n` : ''}${byline}${content}\n${trailer}`;
	},
	essay_index(meta, content) {
		const recent = (meta.pages ?? []).slice(0, 5).map((p) => `<li>\n<time datetime="${p.date}">${formatDate(p.date, false)}</time>\n<a href="${p.permalink}">${esc(p.title)}</a>\n</li>`);
		return `${LIST_STYLE}\n<h3>\n<a class="zola-anchor" href="#most-recent" aria-label="Anchor link for: most-recent">#</a>\nMost Recent\n</h3>\n<ol>\n${recent.join('\n')}\n</ol>\n<a href="/essays/all" style="display: block; padding-top: 10px">See all essays</a>\n${content}\n${trailer}`;
	},
	essay_all(meta) {
		const all = (meta.pages ?? []).map((p) => `<li>\n<time datetime="${p.date}">${formatDate(p.date, false)}</time>\n<a href="${p.permalink}">${p.title}</a>\n</li>`);
		const intercooler = [
			['2016-02-17', 'Jan 14, 2020', 'https://intercoolerjs.org/2020/01/14/taking-html-seriously', 'Take HTML Seriously'],
			['2016-05-08', 'May 08, 2016', 'https://intercoolerjs.org/2016/02/17/api-churn-vs-security.html', 'HATEOAS Is For Humans'],
			['2016-02-17', 'Feb 17, 2016', 'https://intercoolerjs.org/2016/02/17/api-churn-vs-security.html', 'The API Churn/Security Trade-off'],
			['2016-02-17', 'Jan 18, 2016', 'https://intercoolerjs.org/2016/01/18/rescuing-rest.html', 'Rescuing REST From the API Winter'],
		].map(([datetime, shown, href, title]) => `<li>\n<time datetime="${datetime}">${shown}</time>\n<a href="${href}">${title}</a>\n</li>`);
		return `${LIST_STYLE}\n<h1>All Essays</h1>\n<h2>htmx Essays</h2>\n<ol>\n${all.join('\n')}\n</ol>\n<h2>Ye Olde Intercooler.js Essays</h2>\n<ol>\n${intercooler.join('\n')}\n</ol>`;
	},
	talk(meta, content) {
		// The posts section is unsorted, so Zola hands Tera's sort an arbitrary order among posts of one date; the newest
		// file name first is the order htmx.org shows.
		const sorted = [...(meta.posts ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.permalink.localeCompare(a.permalink));
		const posts = sorted.map((p) => `<li><a href="${p.permalink}">${p.date} - ${esc(p.title)} </a>🔥🔥</li>`);
		const podcasts = (meta.podcasts ?? []).map(([name, url]) => `<li><a href="${url}" target="_blank" rel="noopener">${name}</a></li>`);
		return [
			`<h1>${meta.title}</h1>`,
			content,
			anchorHeading('h2', 'announcements', 'Announcements', '🔗'),
			`<ul>\n${posts.join('\n')}\n</ul>`,
			anchorHeading('h2', 'essays', 'Essays', '🔗'),
			'<p><a href="https://htmx.org/essays/">See the essays page &rarr;</a></p>',
			anchorHeading('h2', 'podcasts', 'Podcasts', '🔗'),
			`<ul>\n${podcasts.join('\n')}\n</ul>`,
			'<p><a href="mailto:podcasts@bigsky.software">Contact Us</a> to Join You on Your Podcast!</p>',
		].join('\n');
	},
	'404': () => '<h1 style="margin-bottom: 500px;">\n404 Not Found\n</h1>',
};
