import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { CLICKED_EVENT, clickedEntry, defineMyComponent, INITIAL_CODE, type ClickedDetail, type Entry } from '../../../components/web-components.ts';

export default function WebComponents() @{
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const canvas = element<HTMLElement>();
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Web Components</h1>
			<p>This example shows how to integrate HTMX with web components, allowing it to be used inside of shadow DOM.</p>
			<p>{"By default, HTMX doesn’t know anything about your web components, and won’t see anything inside their shadow DOM. Because of this, you’ll need to manually tell HTMX about your component’s shadow DOM by using "}<a rel="noopener" target="_blank" href="/api/#process"><code>htmx.process</code></a>.</p>
			<pre data-lang="js" style="background-color:#1f2329;color:#abb2bf;" class="language-js "><code class="language-js" data-lang="js"><span style="color:#e06c75;">customElements</span><span>.</span><span style="color:#61afef;">define</span><span>(</span><span style="color:#98c379;">'my-component'</span><span>{", "}</span><span style="color:#c678dd;">{"class "}</span><span style="color:#e5c07b;">{"MyComponent "}</span><span style="color:#c678dd;">{"extends "}</span><span style="color:#e5c07b;">{"HTMLElement "}</span><span>{"{\n"}</span><span>{"  "}</span><span style="font-style:italic;color:#848da1;">{"// This method runs when your custom element is added to the page\n"}</span><span>{"  "}</span><span style="color:#61afef;">connectedCallback</span><span>{"() {\n"}</span><span>{"    "}</span><span style="color:#c678dd;">{"const "}</span><span style="color:#e06c75;">{"root "}</span><span>{"= "}</span><span style="color:#e06c75;">this</span><span>.</span><span style="color:#61afef;">attachShadow</span><span>{"({ mode: "}</span><span style="color:#98c379;">{"'closed' "}</span><span>{"})\n"}</span><span>{"    root."}</span><span style="color:#e06c75;">{"innerHTML "}</span><span>{"= "}</span><span style="color:#98c379;">{"`\n"}</span><span style="color:#98c379;">{"      <button hx-get=\"/my-component-clicked\" hx-target=\"next div\">Click me!</button>\n"}</span><span style="color:#98c379;">{"      <div></div>\n"}</span><span style="color:#98c379;">{"    `\n"}</span><span>{"    "}</span><span style="color:#e06c75;">htmx</span><span>.</span><span style="color:#61afef;">process</span><span>{"(root) "}</span><span style="font-style:italic;color:#848da1;">{"// Tell HTMX about this component's shadow DOM\n"}</span><span>{"  }\n"}</span><span>{"})\n"}</span></code></pre>
			<p>{"Once you’ve told HTMX about your component’s shadow DOM, most things should work as expected. However, note that selectors such as in "}<code>hx-target</code>{" will only see elements inside the same shadow DOM - if you need to access things outside of your web components, you can use one of the following options:"}</p>
			<ul>{" "}<li><code>host</code>: Selects the element hosting the current shadow DOM</li>{" "}<li><code>global</code>: If used as a prefix, selects from the main document instead of the current shadow DOM</li>{" "}</ul>
			<p>{"The same principles generally apply to web components that don’t use shadow DOM as well; while selectors won’t be encapsulated like with shadow DOM, you’ll still have to point HTMX to your component’s content by calling "}<code>htmx.process</code>.</p>
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
										<b>GET</b>{' /my-component-clicked'}
									</div>
									<div>{'parameters: {}'}</div>
									<div>{'headers: {}'}</div>
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
			{/* init("/demo") wrote <my-component> here; the element builds its shadow DOM once it is defined, and each answer
			    of its button's GET /my-component-clicked is logged as demo.js logged it. */}
			<div
				id="demo-canvas"
				el={canvas}
				onIdle={() => {
					if (!canvas) return;
					canvas.addEventListener(CLICKED_EVENT, (event) => {
						const entry = clickedEntry(log.length + 1);
						(event as CustomEvent<ClickedDetail>).detail.response = entry.code;
						log = [entry, ...log];
						selected = entry.id;
					});
					defineMyComponent();
					// The request log is still empty; committing it once here moves the page's first state commit, and the start-up
					// work it waits a task for, off the first click (the request log's toggler answered ~15 ms later without it).
					log = [];
				}}
			>
				<my-component></my-component>
			</div>
		</main>
		<SiteFooter />
	</div>
}
