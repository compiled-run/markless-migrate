import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { getEntry, TAB_TEXT, type Entry } from '../../../components/tabs-hateoas.ts';

// The fake server's delay before it answers (demo.js's sinon autoRespondAfter).
const RESPONSE_DELAY = 80;
// The page's onGet("/tabN") answers, a paragraph of the tab's text.
const tabResponse = (n: number) => `\n\t\t\t<p>${TAB_TEXT[n - 1]!.slice(4, -3)}</p>\n\t\t`;

export default function TabsJavascript() @{
	// The selected tab, the tab whose text #tab-contents shows (0 until the load request's answer), and the element whose
	// GET is in flight (it carries htmx-request until the answer): 'contents' for the load request, or a tab's number.
	let current = state(1);
	let shown = state(0);
	let requesting = state<number | 'contents'>('contents');
	// The tabs that have had a class, one bit each (htmx and the hx-on handler leave class="" behind when they take theirs away).
	let classed = state(1);
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
			<h1>Tabs (Using JavaScript)</h1>
			{" "}
			<p>This example shows how to load tab contents using htmx, and to select the “active” tab using Javascript. This reduces some duplication by offloading some of the work of re-rendering the tab HTML from your application server to your clients’ browsers.</p>
			{" "}
			<p>{"You may also consider "}<a href="/examples/tabs-hateoas/">a more idiomatic approach</a>{" that follows the principle of "}<a rel="noopener" target="_blank" href="https://en.wikipedia.org/wiki/HATEOAS">Hypertext As The Engine Of Application State</a>.</p>
			{" "}
			<h2 id="example-code"><a class="zola-anchor" href="#example-code" aria-label="Anchor link for: example-code">Example Code</a></h2>
			{" "}
			<p>{"The HTML below displays a list of tabs, with added HTMX to dynamically load each tab pane from the server. A simple JavaScript event handler uses the "}<a rel="noopener" target="_blank" href="https://hyperscript.org/commands/take/"><code>take</code>{" function"}</a>{" to switch the selected tab when the content is swapped into the DOM."}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>{"\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"tabs\" "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#tab-contents\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tablist\"\n"}</span><span>{"     "}</span><span style="color:#d19a66;">hx-on:htmx-after-on-load</span><span>=</span><span style="color:#98c379;">{"\"let currentTab = document.querySelector('[aria-selected=true]');\n"}</span><span style="color:#98c379;">{"                               currentTab.setAttribute('aria-selected', 'false')\n"}</span><span style="color:#98c379;">{"                               currentTab.classList.remove('selected')\n"}</span><span style="color:#98c379;">{"                               let newTab = event.target\n"}</span><span style="color:#98c379;">{"                               newTab.setAttribute('aria-selected', 'true')\n"}</span><span style="color:#98c379;">{"                               newTab.classList.add('selected')\""}</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tab\" "}</span><span style="color:#d19a66;">aria-controls</span><span>=</span><span style="color:#98c379;">{"\"tab-contents\" "}</span><span style="color:#d19a66;">aria-selected</span><span>=</span><span style="color:#98c379;">{"\"true\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/tab1\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"selected"</span><span>&gt;Tab 1&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tab\" "}</span><span style="color:#d19a66;">aria-controls</span><span>=</span><span style="color:#98c379;">{"\"tab-contents\" "}</span><span style="color:#d19a66;">aria-selected</span><span>=</span><span style="color:#98c379;">{"\"false\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/tab2"</span><span>&gt;Tab 2&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tab\" "}</span><span style="color:#d19a66;">aria-controls</span><span>=</span><span style="color:#98c379;">{"\"tab-contents\" "}</span><span style="color:#d19a66;">aria-selected</span><span>=</span><span style="color:#98c379;">{"\"false\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/tab3"</span><span>&gt;Tab 3&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"tab-contents\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"tabpanel\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/tab1\" "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">"load"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
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
			{/* Each button's hx-get="/tabN" under #tabs' hx-target="#tab-contents": the fake server answers after 80 ms (the button
			    carries htmx-request until then), the answer replaces #tab-contents' content, and the hx-on:htmx-after-on-load
			    handler then moves aria-selected and the selected class to the clicked button. */}
			<div
				id="tabs"
				hx-target="#tab-contents"
				role="tablist"
				hx-on:htmx-after-on-load={"console.log(event)\n                               let currentTab = document.querySelector('[aria-selected=true]');\n                                          currentTab.setAttribute('aria-selected', 'false')\n                                          currentTab.classList.remove('selected')\n                                          let newTab = event.target\n                                          newTab.setAttribute('aria-selected', 'true')\n                                          newTab.classList.add('selected')"}
			>
				@for (const n of [1, 2, 3]; key n) {
					{/* The whitespace between the old markup's inline-block buttons. */}
					{" "}
					<button
						role="tab"
						aria-controls="tab-contents"
						aria-selected={n === current ? 'true' : 'false'}
						hx-get={`/tab${n}`}
						class={!(classed & (1 << (n - 1))) ? undefined : n === current && n === requesting ? 'selected htmx-request' : n === current ? 'selected' : n === requesting ? 'htmx-request' : ''}
						onClick={() => {
							requesting = n;
							classed = classed | (1 << (n - 1));
							setTimeout(() => {
								// demo.js logs the answer before htmx swaps it in.
								log = [getEntry(log.length + 1, `/tab${n}`, tabResponse(n)), ...log];
								selected = `req-${log.length}`;
								shown = n;
								current = n;
								if (requesting === n) requesting = 0;
							}, RESPONSE_DELAY);
						}}
					>
						{`Tab ${n}`}
					</button>
				}
				{" "}
			</div>
			{" "}
			{/* hx-get="/tab1" hx-trigger="load": the first tab's text arrives 80 ms after htmx starts. */}
			<div
				id="tab-contents"
				role="tabpanel"
				hx-get="/tab1"
				hx-trigger="load"
				class={requesting === 'contents' ? 'htmx-request' : ''}
				onIdle={() => {
					setTimeout(() => {
						log = [getEntry(log.length + 1, '/tab1', tabResponse(1)), ...log];
						selected = `req-${log.length}`;
						shown = 1;
						if (requesting === 'contents') requesting = 0;
					}, RESPONSE_DELAY);
				}}
			>
				{/* The page's onGet("/tabN") answers. */}
				@if (shown === 1) {
					<>{'\n\t\t\t'}<p>{"Commodo normcore truffaut VHS duis gluten-free keffiyeh iPhone taxidermy godard ramps anim pour-over.\n\t\t\tPitchfork vegan mollit umami quinoa aute aliquip kinfolk eiusmod live-edge cardigan ipsum locavore.\n\t\t\tPolaroid duis occaecat narwhal small batch food truck.\n\t\t\tPBR&B venmo shaman small batch you probably haven't heard of them hot chicken readymade.\n\t\t\tEnim tousled cliche woke, typewriter single-origin coffee hella culpa.\n\t\t\tArt party readymade 90's, asymmetrical hell of fingerstache ipsum."}</p>{'\n\t\t'}</>
				}
				@if (shown === 2) {
					<>{'\n\t\t\t'}<p>{"Kitsch fanny pack yr, farm-to-table cardigan cillum commodo reprehenderit plaid dolore cronut meditation.\n\t\t\tTattooed polaroid veniam, anim id cornhole hashtag sed forage.\n\t\t\tMicrodosing pug kitsch enim, kombucha pour-over sed irony forage live-edge.\n\t\t\tVexillologist eu nulla trust fund, street art blue bottle selvage raw denim.\n\t\t\tDolore nulla do readymade, est subway tile affogato hammock 8-bit.\n\t\t\tGodard elit offal pariatur you probably haven't heard of them post-ironic.\n\t\t\tPrism street art cray salvia."}</p>{'\n\t\t'}</>
				}
				@if (shown === 3) {
					<>{'\n\t\t\t'}<p>{"Aute chia marfa echo park tote bag hammock mollit artisan listicle direct trade.\n\t\t\tRaw denim flexitarian eu godard etsy.\n\t\t\tPoke tbh la croix put a bird on it fixie polaroid aute cred air plant four loko gastropub swag non brunch.\n\t\t\tIceland fanny pack tumeric magna activated charcoal bitters palo santo laboris quis consectetur cupidatat portland aliquip venmo."}</p>{'\n\t\t'}</>
				}
			</div>
			{" "}
			{" "}
		</main>
		<SiteFooter />
	</div>
}
