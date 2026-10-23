import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { agents, FIRST_PAGE, initialCode, responseEntry, rowsTemplate, type Agent, type Entry } from '../../../components/click-to-load.ts';

export default function ClickToLoad() @{
	let contacts = state<readonly Agent[]>(FIRST_PAGE);
	let page = state(1);
	let loading = state(false);
	let initCode = state('');
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const button = element<HTMLButtonElement>();
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Click to Load</h1>
			<p>This example shows how to implement click-to-load the next page in a table of data. The crux of the demo is the final row:</p>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"tr "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"replaceMe"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"td "}</span><span style="color:#d19a66;">colspan</span><span>=</span><span style="color:#98c379;">"3"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"'btn primary' "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/contacts/?page=2\"\n"}</span><span>{"                        "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#replaceMe\"\n"}</span><span>{"                        "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"         Load More Agents... <"}</span><span style="color:#e06c75;">{"img "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"htmx-indicator\" "}</span><span style="color:#d19a66;">src</span><span>=</span><span style="color:#98c379;">{"\"/img/bars.svg\" "}</span><span style="color:#d19a66;">alt</span><span>=</span><span style="color:#98c379;">""</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span></code></pre>
			<p>{"This row contains a button that will replace the entire row with the next page of results (which will contain a button to load the "}<em>next</em>{" page of results). And so on."}</p>
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
								<pre class="language-html"><code class="language-html">{initCode}</code></pre>
							</span>
						</div>
					</div>
				</div>
			</div>
			<h2><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">🔗</a>Demo</h2>
			{/* The page's init("/demo") drew the first page with Math.random ids as it loaded; they are drawn in the browser here too. */}
			<div
				id="demo-canvas"
				onIdle={() => {
					const first = agents(10);
					contacts = first;
					initCode = initialCode(first);
				}}
			>
				<table>
					<thead>
						<tr><th>Name</th><th>Email</th><th>ID</th></tr>
					</thead>
					<tbody>
						@for (const contact of contacts; key contact.email) {
							{/* Until the hashes are drawn, a hidden one of the same length holds the column's width, so the table does not reflow. */}
								<tr><td>{contact.name}</td><td>{contact.email}</td><td>{contact.id}@if (!contact.id) {<span aria-hidden="true" style="visibility: hidden">GDB0CF27E9A5G83</span>}</td></tr>
						}
						<tr id="replaceMe">
							<td colspan="3">
								<center>
									{/* hx-get="/contacts/?page=N" with hx-swap="outerHTML": the fake server answers after 80 ms, the button
									    carries htmx-request (its indicator shows) until then, and the row it replaced took the focus with it. */}
									<button
										el={button}
										class={loading ? 'btn primary htmx-request' : 'btn primary'}
										onClick={() => {
											if (loading) return;
											loading = true;
											setTimeout(() => {
												const next = page + 1;
												const fresh = agents(10 + contacts.length);
												const url = `/contacts/?page=${next}`;
												log = [responseEntry(log.length + 1, url, { page: String(next) }, rowsTemplate(next, fresh)), ...log];
												selected = `req-${log.length}`;
												contacts = [...contacts, ...fresh];
												page = next;
												loading = false;
												if (button && document.activeElement === button) button.blur();
											}, 80);
										}}
									>
										{'\n         Load More Agents... '}
										<img class="htmx-indicator" src="/img/bars.svg" alt="" />
										{'\n       '}
									</button>
								</center>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</main>
		<SiteFooter />
	</div>
}
