# Rebuilds pages/index.tsrx from .port/draft/home.tsrx.txt: python3 .port/assemble-home.py (line numbers are the draft's).
L = open('.port/draft/home.tsrx.txt').read().split('\n')
end = L.index('</body>')
# Written out: in Markless 0.4.0 a handler in an @for row loses its item after resume ("reading 'key'" of undefined).
TABS = """					<button
						class={step === 'directives' ? 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1 bg-gray-800 text-white' : 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1'}
						onClick={() => {
							direction = STEP_ORDER.indexOf('directives') > STEP_ORDER.indexOf(step) ? 'right' : 'left';
							step = 'directives';
						}}
					>
						{' '}
						<strong>15</strong>
						{' '}
						<span>Attributes</span>
						{' '}
					</button>
					<button
						class={step === 'magics' ? 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1 bg-gray-800 text-white' : 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1'}
						onClick={() => {
							direction = STEP_ORDER.indexOf('magics') > STEP_ORDER.indexOf(step) ? 'right' : 'left';
							step = 'magics';
						}}
					>
						{' '}
						<strong>6</strong>
						{' '}
						<span>Properties</span>
						{' '}
					</button>
					<button
						class={step === 'methods' ? 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1 bg-gray-800 text-white' : 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1'}
						onClick={() => {
							direction = STEP_ORDER.indexOf('methods') > STEP_ORDER.indexOf(step) ? 'right' : 'left';
							step = 'methods';
						}}
					>
						{' '}
						<strong>2</strong>
						{' '}
						<span>Methods</span>
						{' '}
					</button>"""
out = []
for i in range(1, end):
    n = i + 1; l = L[i]
    if n == 3: out.append('\t\t<div id="docsearch">\n\t\t\t<SearchButton />\n\t\t</div>'); continue
    if n == 50:
        assert 'dropped <template>' in l, l
        out.append(TABS); continue
    if 'dropped <' in l: continue
    if n == 54:
        assert 'absolute bottom-0 left-0 right-0 z-10' in l, l
        out.append(l.replace('z-10">', 'z-10" style="display: none;">')); continue
    if n in (61, 320, 423):
        assert l.strip() == '<div>', (n, l)
        key = {61: 'directives', 320: 'magics', 423: 'methods'}[n]
        out.append(f"\t\t\t\t<div style={{step === '{key}' ? '' : 'display: none;'}} class={{step === '{key}' ? entering : ''}} onAnimationEnd={{() => (direction = '')}}>"); continue
    out.append(l)
content = '\n'.join('\t' + l for l in out)
HEAD = """import type { PageProps } from '@markless/router';
import { computed, state } from '@markless/core';
import SearchButton from '../components/search-button.tsrx';

const STEP_ORDER = ['directives', 'magics', 'methods'];

export default function Home(_props: PageProps) @{
	let step = state('directives');
	let direction = state('');
	// Alpine's x-transition slides the new panel in from the side its tab sits on; home.css plays that enter once.
	const entering = computed(() => (direction ? `enter-from-${direction}` : ''));
"""
ATTRIBUTION = '\t\t\t\t<p class="port-attribution" style="position: fixed; right: 8px; bottom: 8px; z-index: 50; max-width: 360px; margin: 0; padding: 6px 10px; border-radius: 6px; font: 12px/1.4 system-ui, sans-serif; text-align: left; color: #222; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);">Unofficial demo copy of <a style="color: #1a4fa0; text-decoration: underline;" href="https://alpinejs.dev">alpinejs.dev</a>, moved to <a style="color: #1a4fa0; text-decoration: underline;" href="https://markless.dev">Markless</a> with markless-migrate. Alpine.js and its documentation © Caleb Porzio and contributors, <a style="color: #1a4fa0; text-decoration: underline;" href="https://github.com/alpinejs/alpine/blob/main/LICENSE.md">MIT license</a>.</p>\n'
anchor = '- <a href="https://twitter.com/calebporzio" class="underline">Caleb</a>'
i = content.index(anchor)
j = content.index('</p>', i) + len('</p>\n')
content = content[:j] + ATTRIBUTION + content[j:]
open('pages/index.tsrx', 'w').write(HEAD + '\n\t<div style="display: contents">\n' + content + '\n\t</div>\n}\n')
