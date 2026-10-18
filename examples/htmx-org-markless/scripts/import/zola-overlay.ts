// Content-only Zola templates: each prints its page's front matter as JSON and the rendered markdown, so the
// Markless layouts (scripts/import/templates.ts) own the page chrome and Zola owns markdown, heading ids and highlighting.

const meta = (name: string, extra = '') => `{%- if page -%}{%- set m = page -%}{%- else -%}{%- set m = section -%}{%- endif -%}
<script id="zola-meta" type="application/json">{"template":"${name}","kind":"{% if page %}page{% else %}section{% endif %}","title":{{ m.title | default(value="") | json_encode | safe }},"description":{{ m.description | default(value="") | json_encode | safe }},"date":{{ m.date | default(value="") | json_encode | safe }},"authors":{{ m.authors | default(value=[]) | json_encode | safe }},"extra":{{ m.extra | json_encode | safe }},"path":{{ m.path | json_encode | safe }}${extra}}</script>
<div id="zola-content">{{ m.content | safe }}</div>`;

const pageList = (key: string, pages: string) =>
	`,"${key}":[{% for p in ${pages} %}{"title":{{ p.title | json_encode | safe }},"permalink":{{ p.permalink | json_encode | safe }},"date":{{ p.date | default(value="") | json_encode | safe }}}{% if not loop.last %},{% endif %}{% endfor %}]`;

export const OVERLAY_TEMPLATES: Record<string, string> = {
	'index.html': meta('index'),
	'page.html': meta('page'),
	'section.html': meta('section'),
	'demo.html': meta('demo'),
	'essay.html': meta('essay'),
	'essay_index.html': meta('essay_index', pageList('pages', 'section.pages')),
	'essay_all.html': `{% set essays = get_section(path="essays/_index.md") %}${meta('essay_all', pageList('pages', 'essays.pages'))}`,
	'talk.html': `{% set posts = get_section(path="posts/_index.md") %}{% set podcasts = load_data(path="content/talk/podcasts.csv") %}${meta(
		'talk',
		`${pageList('posts', 'posts.pages | sort(attribute="date") | reverse')},"podcasts":{{ podcasts.records | json_encode | safe }}`,
	)}`,
	'404.html': '<script id="zola-meta" type="application/json">{"template":"404","kind":"page","title":"","description":"","date":"","authors":[],"extra":{},"path":"/404/"}</script><div id="zola-content"></div>',
};
