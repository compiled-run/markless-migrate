import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { GRAPH_ENTRY, INITIAL_CODE, RESPONSE_DELAY, SETTLE_DELAY, type Entry } from '../../../components/lazy-load.ts';

export default function LazyLoad() @{
	// The div's hx-trigger="load" request is in flight from the moment htmx starts: 'request' until the fake server answers,
	// 'settling' for htmx's settle delay after the swap (the graph's opacity transition starts as it ends), then ''.
	let phase = state('htmx-request');
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Lazy Loading</h1>
			<p>This example shows how to lazily load an element on a page. We start with an initial state that looks like this:</p>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/graph\" "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">"load"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"img "}</span><span style="color:#d19a66;">alt</span><span>=</span><span style="color:#98c379;">{"\"Result loading...\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"htmx-indicator\" "}</span><span style="color:#d19a66;">width</span><span>=</span><span style="color:#98c379;">{"\"150\" "}</span><span style="color:#d19a66;">src</span><span>=</span><span style="color:#98c379;">"/img/bars.svg"</span><span>{"/>\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			<p>Which shows a progress indicator as we are loading the graph. The graph is then loaded and faded gently into view via a settling CSS transition:</p>
			<pre data-lang="css" style="background-color:#1f2329;color:#abb2bf;" class="language-css "><code class="language-css" data-lang="css"><span style="color:#d19a66;">{".htmx-settling "}</span><span style="color:#e06c75;">{"img "}</span><span>{"{\n"}</span><span>{"  opacity: "}</span><span style="color:#d19a66;">0</span><span>{";\n"}</span><span>{"}\n"}</span><span style="color:#e06c75;">{"img "}</span><span>{"{\n"}</span><span>{" transition: opacity "}</span><span style="color:#d19a66;">{"300ms "}</span><span>{"ease-in;\n"}</span><span>{"}\n"}</span></code></pre>
			<div id="demo-server-info" class={showInfo ? 'show' : ''}>
				<div>
					Server Requests<span id="request-count">{count}</span>{' '}
					<a id="request-info-toggler" style="cursor: pointer" onClick={() => (showInfo = !showInfo)}>{showInfo ? '↓ Hide' : '↑ Show'}</a>
				</div>
				<div id="demo-activity" class="row">
					<div class="3 col">
						{/* One handler for the whole timeline, as each entry's link called showTimelineEntry. */}
						<ol
							id="demo-timeline"
							reversed=""
							onClick={(event) => {
								const item = (event.target as Element).closest('li');
								if (item) selected = item.id.replace(/-link$/, '');
							}}
						>
							@for (const entry of log; key entry.id) {
								<li id={`${entry.id}-link`} class={entry.id === selected ? 'active' : ''}>
									<a style="cursor: pointer">{entry.label}</a>
								</li>
							}
							<li id="init-link" class={selected === 'init' ? 'active' : ''}>
								<a style="cursor: pointer">Initial State</a>
							</li>
						</ol>
					</div>
					<div id="demo-current-request" class="9 col">
						@for (const entry of log; key entry.id) {
							<div id={entry.id} class={entry.id === selected ? '' : 'hide'}>
								<span class="activity response">
									<div>
										<b>{entry.method}</b>{` ${entry.url}`}
									</div>
									<div>{`parameters: ${entry.params}`}</div>
									<div>{`headers: ${entry.headers}`}</div>
									<div>
										<b>Response</b>
										<pre class="language-html"><code class="language-html">{entry.code}</code></pre>
									</div>
								</span>
							</div>
						}
						<div id="init" class={selected === 'init' ? '' : 'hide'}>
							<span class="activity initial">
								<b>HTML</b>
								<pre class="language-html"><code class="language-html">{INITIAL_CODE}</code></pre>
							</span>
						</div>
					</div>
				</div>
			</div>
			<h2><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">🔗</a>Demo</h2>
			<div id="demo-canvas">
				{/* hx-get="/graph" hx-trigger="load": the fake server answers after two seconds, the indicator shows until then,
				    and the graph replaces the div's content, faded in by the page's .htmx-settling rule. */}
				<div
					hx-get="/graph"
					hx-trigger="load"
					class={phase}
					onIdle={() => {
						setTimeout(() => {
							log = [GRAPH_ENTRY];
							selected = GRAPH_ENTRY.id;
							phase = 'htmx-settling';
							setTimeout(() => (phase = ''), SETTLE_DELAY);
						}, RESPONSE_DELAY);
					}}
				>
					@if (phase === 'htmx-request') {
						<>{'\n  '}<img alt="Result loading..." class="htmx-indicator" width="150" src="/img/bars.svg" />{'\n'}</>
					} @else {
						<img alt="Tokyo Climate" src="/img/tokyo.png" class="" />
					}
				</div>
			</div>
		</main>
		<SiteFooter />
	</div>
}
