# Rebuilds a docs page's .tsrx from its draft: python3 .port/assemble.py <draft> <out> <ExportName> <headings-const> <prev-href|-> <prev-label> <next-href|-> <next-label> <demo-module> <DemoName>...
import re, sys
draft, out, export, headings, ph, pl, nh, nl, module, *names = sys.argv[1:]

# Cloudflare's email obfuscation turned "alpinejs@3.x.x" in code samples into a link the browser decodes; write it decoded.
def decode(match):
    data = bytes.fromhex(match.group(1))
    return ''.join(chr(b ^ data[0]) for b in data[1:]).replace('@', '&#64;')

text = re.sub(r'<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="([0-9a-f]+)">[^<]*</a>', decode, open(draft).read())
L = text.split('\n')
a = [i for i, l in enumerate(L) if 'listen-for-intersection-of-titles' in l][0] + 1
b = [i for i, l in enumerate(L) if 'my-12 border-y border-gray-200' in l][0]
body = L[a:b]
res = []; i = 0; n = 0
while i < len(body):
    l = body[i]
    if l.strip() == '<div class="demo">':
        ind = l[:len(l) - len(l.lstrip())]; j = i
        while body[j] != ind + '</div>': j += 1
        res.append(f"{ind}<{names[n]} />"); n += 1; i = j + 1; continue
    res.append(l); i += 1
assert n == len(names), (n, len(names))
content = '\n'.join('\t' + l for l in res)
prev = f'\n\t\t\t\t\t\t<a class="font-bold text-cyan-400" href="{ph}">← {pl}</a>\n\t\t\t\t\t' if ph != '-' else ''
nxt = f'\n\t\t\t\t\t\t<a class="font-bold text-cyan-400" href="{nh}">{nl} →</a>\n\t\t\t\t\t' if nh != '-' else ''
demo_import = f"import {{ {', '.join(names)} }} from '../{'../' * (out.count('/') - 1)}components/{module}';\n" if names else ''
up = '../' * out.count('/')
page = f"""import type {{ PageProps }} from '@markless/router';
import DocsHeader from '{up}components/docs-header.tsrx';
import DocsSidebar from '{up}components/docs-sidebar.tsrx';
import Sponsor from '{up}components/sponsor.tsrx';
import Toc from '{up}components/toc.tsrx';
{demo_import.replace("'../" + '../' * (out.count('/') - 1), "'" + up)}import {{ {headings}, wake, watchHeadings as watch }} from '{up}site.ts';

// An imported function inside attach is not carried into the compiled behaviour in Markless 0.4.0 ("is not defined"); a module-level one is.
function watchHeadings(main: HTMLElement): () => void {{
	return watch(main);
}}

export default function {export}({{ url }}: PageProps) @{{
	<div style="display: contents">
		<DocsHeader pathname={{url.pathname}} />
		<DocsSidebar pathname={{url.pathname}} />
		<main class="pt-32 pl-0 pr-0 md:pl-48 lg:pl-64 xl:pr-64" attach={{(main) => watchHeadings(main)}} onWheel={{() => wake()}} onTouchStart={{() => wake()}} onKeyDown={{() => wake()}}>
			<div class="m-auto max-w-3xl px-6 pb-24 text-gray-800 antialiased markdown" listen-for-intersection-of-titles="">
{content}
				<Sponsor wrapper="my-12 border-y border-gray-200 py-6 xl:hidden" label="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400" />
				<div class="flex justify-between border-t border-gray-200 pt-4 text-gray-700">
					<div>{prev}</div>
					<div>{nxt}</div>
				</div>
				<p class="mt-6 text-center text-sm text-gray-600">Code highlighting provided by <a href="https://torchlight.dev" target="__blank" class="font-semibold text-cyan-400">Torchlight</a></p>
				<div class="mt-6 flex items-center justify-center gap-4 text-center text-sm text-gray-600"></div>
				<p class="port-attribution" style="position: fixed; right: 8px; bottom: 8px; z-index: 50; max-width: 360px; margin: 0; padding: 6px 10px; border-radius: 6px; font: 12px/1.4 system-ui, sans-serif; text-align: left; color: #222; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);">Unofficial demo copy of <a style="color: #1a4fa0; text-decoration: underline;" href="https://alpinejs.dev">alpinejs.dev</a>, moved to <a style="color: #1a4fa0; text-decoration: underline;" href="https://markless.dev">Markless</a> with markless-migrate. Alpine.js and its documentation © Caleb Porzio and contributors, <a style="color: #1a4fa0; text-decoration: underline;" href="https://github.com/alpinejs/alpine/blob/main/LICENSE.md">MIT license</a>.</p>
			</div>
		</main>
		<Toc headings={{{headings}}} />
	</div>
}}
"""
open(out, 'w').write(page)
