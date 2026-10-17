# Rebuilds an htmx.org page from its draft: python3 .port/assemble.py <draft> <out> <ExportName>
# The page is the shared header, the draft's <main> and the shared footer; page-specific edits are below.
import sys
draft, out, export = sys.argv[1:]
L = open(draft).read().split('\n')
start = next(i for i, l in enumerate(L) if l.startswith('\t<main'))
end = L.index('\t</main>')
main = []
for l in L[start:end + 1]:
    if 'moved <style> to a stylesheet' in l: continue
    if 'dropped <script>' in l and export != 'Home': continue
    main.append(l)
text = '\n'.join('\t' + l for l in main)
if export == 'Home':
    # class-tools adds "appear" to the hero after load; port-home.css plays the same fade as a CSS animation.
    # class-tools' classes="add appear" adds the class 100 ms after load, and site.css fades the hero in; the same, as a script.
    hero_end = text.index('\n\t\t\t</div>\n', text.index('<div class="dark-hero full-width">')) + len('\n\t\t\t</div>\n')
    text = text[:hero_end] + "\t\t\t<script>{'setTimeout(function () { document.querySelector(`.dark-hero`).classList.add(`appear`); }, 100);'}</script>\n" + text[hero_end:]
    # The homepage's own query-string easter eggs (?wuw, ?uwu, ?ads) stay a plain inline script, as on htmx.org.
    # Without quotes or ampersands: Markless 0.4.0 escapes them inside <script>.
    egg = "{'var q = window.location.search; if (q == `?wuw=true` || q == `?suw=true`) document.body.classList.add(`lmao`); if (q == `?uwu=true`) document.body.classList.add(`kawaii`); if (q == `?ads=true`) document.body.classList.add(`ads`);'}"
    text = text.replace('{/* dropped <script> */}', '<script type="application/javascript">' + egg + '</script>', 1)
    assert 'dropped <script>' not in text
up = '../' * out.count('/')
page = f"""import SiteFooter from '{up}components/site-footer.tsrx';
import SiteHeader from '{up}components/site-header.tsrx';

export default function {export}() @{{
	<div style="display: contents">
		<SiteHeader />
{text}
		<SiteFooter{' wide={true}' if 'wide-content' in L[start] else ''} />
	</div>
}}
"""
open(out, 'w').write(page)
