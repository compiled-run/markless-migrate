import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { TAB_TEXT, tabEntry, type Entry } from '../../../components/tabs-hateoas.ts';

export default function TabsHateoas() @{
	// The selected tab, whether a tab's answer has been swapped in yet (its selected button then carries autofocus), and
	// the tab whose GET is in flight (its button carries htmx-request).
	let current = state(1);
	let swapped = state(false);
	let requesting = state(0);
	let log = state<Entry[]>([]);
	let selected = state('');
	let showInfo = state(false);
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Tabs (Using HATEOAS)</h1>
			{" "}
			{" "}
			{" "}
			<p>{"This example shows how easy it is to implement tabs using htmx. Following the principle of "}<a rel="noopener" target="_blank" href="https://en.wikipedia.org/wiki/HATEOAS">Hypertext As The Engine Of Application State</a>{", the selected tab is a part of the application state. Therefore, to display and select tabs in your application, simply include the tab markup in the returned HTML. If this does not suit your application server design, you can also use a little bit of "}<a href="/examples/tabs-javascript/">JavaScript to select tabs instead</a>.</p>
			{" "}
			<h2 id="example-code-main-page"><a class="zola-anchor" href="#example-code-main-page" aria-label="Anchor link for: example-code-main-page">Example Code (Main Page)</a></h2>
			{" "}
			<p>The main page simply includes the following HTML to load the initial tab into the DOM.</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"tabs\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/tab1\" "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"load delay:100ms\" "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#tabs\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"innerHTML"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<h2 id="example-code-each-tab"><a class="zola-anchor" href="#example-code-each-tab" aria-label="Anchor link for: example-code-each-tab">Example Code (Each Tab)</a></h2>
			{" "}
			<p>Subsequent tab pages display all tabs and highlight the selected one accordingly.</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"tab-list\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">"tablist"</span><span>{">\n"}</span><span>{"\t<"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/tab1\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"selected\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tab\" "}</span><span style="color:#d19a66;">aria-selected</span><span>=</span><span style="color:#98c379;">{"\"true\" "}</span><span style="color:#d19a66;">aria-controls</span><span>=</span><span style="color:#98c379;">"tab-content"</span><span>&gt;Tab 1&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"\t<"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/tab2\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tab\" "}</span><span style="color:#d19a66;">aria-selected</span><span>=</span><span style="color:#98c379;">{"\"false\" "}</span><span style="color:#d19a66;">aria-controls</span><span>=</span><span style="color:#98c379;">"tab-content"</span><span>&gt;Tab 2&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"\t<"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/tab3\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tab\" "}</span><span style="color:#d19a66;">aria-selected</span><span>=</span><span style="color:#98c379;">{"\"false\" "}</span><span style="color:#d19a66;">aria-controls</span><span>=</span><span style="color:#98c379;">"tab-content"</span><span>&gt;Tab 3&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"tab-content\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tabpanel\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"tab-content"</span><span>{">\n"}</span><span>{"\tCommodo normcore truffaut VHS duis gluten-free keffiyeh iPhone taxidermy godard ramps anim pour-over.\n"}</span><span>{"\tPitchfork vegan mollit umami quinoa aute aliquip kinfolk eiusmod live-edge cardigan ipsum locavore.\n"}</span><span>{"\tPolaroid duis occaecat narwhal small batch food truck.\n"}</span><span>{"\tPBR&B venmo shaman small batch you probably haven't heard of them hot chicken readymade.\n"}</span><span>{"\tEnim tousled cliche woke, typewriter single-origin coffee hella culpa.\n"}</span><span>{"\tArt party readymade 90's, asymmetrical hell of fingerstache ipsum.\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
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
					</div>
				</div>
			</div>
			{" "}
			<h2><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">🔗</a>Demo</h2>
			{" "}
			<div id="demo-canvas">{" "}</div>
			{" "}
			{/* Each button's hx-get="/tabN" under #tabs' hx-target="this" and hx-swap="innerHTML": the fake server answers after
			    80 ms with the whole tab list, the chosen tab selected and autofocus on it, and its text (the button carries
			    htmx-request until then); htmx then focuses the autofocus button. */}
			<div id="tabs">
				<div class="tab-list" role="tablist">
					@for (const n of [1, 2, 3]; key n) {
						{/* The whitespace between the old markup's inline-block buttons. */}
						{" "}
						<button
							class={[n === current ? 'selected' : '', n === requesting ? 'htmx-request' : ''].filter(Boolean).join(' ') || undefined}
							role="tab"
							aria-selected={n === current ? 'true' : 'false'}
							autofocus={swapped && n === current ? '' : undefined}
							aria-controls="tab-content"
							onClick={(event) => {
								const button = (event.target as Element).closest('button');
								requesting = n;
								setTimeout(() => {
									log = [tabEntry(log.length + 1, n), ...log];
									selected = `req-${log.length}`;
									current = n;
									swapped = true;
									if (requesting === n) requesting = 0;
									button?.focus();
								}, 80);
							}}
						>
							{`Tab ${n}`}
						</button>
					}
				</div>
				<div id="tab-content" role="tabpanel" class="tab-content">{TAB_TEXT[current - 1]}</div>
			</div>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
