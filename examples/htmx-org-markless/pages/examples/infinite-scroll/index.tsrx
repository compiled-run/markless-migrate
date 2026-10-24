import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { agents, FIRST_PAGE, initialCode, RESPONSE_DELAY, responseEntry, rowsTemplate, type Agent, type Entry } from '../../../components/infinite-scroll.ts';

export default function InfiniteScroll() @{
	let contacts = state<readonly Agent[]>(FIRST_PAGE);
	let page = state(1);
	let loading = state(false);
	let initCode = state('');
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
			<h1>Infinite Scroll</h1>
			<p>The infinite scroll pattern provides a way to load content dynamically on user scrolling action.</p>
			<p>Let’s focus on the final row (or the last element of your content):</p>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"tr "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/contacts/?page=2\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"revealed\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"afterend"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;Agent Smith&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;void29&#64;null.org&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;55F49448C0&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span></code></pre>
			<p>{"This last element contains a listener which, when scrolled into view, will trigger a request. The result is then appended after it. The last element of the results will itself contain the listener to load the "}<em>next</em>{" page of results, and so on."}</p>
			<blockquote>{" "}<p><code>revealed</code>{" - triggered when an element is scrolled into the viewport (also useful for lazy-loading). If you are using "}<code>overflow</code>{" in css like "}<code>overflow-y: scroll</code>{" you should use "}<code>intersect once</code>{" instead of "}<code>revealed</code>.</p>{" "}</blockquote>
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
			{/* The page's init("/demo") drew the first page with Math.random ids as it loaded; they are drawn in the browser here too.
			    hx-get="/contacts/?page=N" hx-trigger="revealed" hx-swap="afterend" on the last row: once it is on screen the fake
			    server answers after a second, the indicator below the table shows until then (the table's hx-indicator), and the next
			    twenty rows follow it. The rows carry no handler of their own (an onVisible inside the @for stops it updating), so
			    htmx's own revealed check runs here: whether the row is on screen when it arrives, then every 200 ms after the window
			    scrolled or resized, each row revealed once. */}
			<div
				id="demo-canvas"
				onIdle={() => {
					const first = agents(10);
					contacts = first;
					initCode = initialCode(first);
					const body = document.querySelector('#demo-canvas tbody')!;
					const revealed = new WeakSet<Element>();
					const load = () => {
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
							// htmx processes the swapped rows once they settle (its 20 ms settle delay).
							setTimeout(maybeReveal, 20);
						}, RESPONSE_DELAY);
					};
					const maybeReveal = () => {
						const row = body.lastElementChild;
						if (!row || revealed.has(row)) return;
						const rect = row.getBoundingClientRect();
						if (!(rect.top < window.innerHeight && rect.bottom >= 0)) return;
						revealed.add(row);
						load();
					};
					let scrolling = false;
					const onScroll = () => (scrolling = true);
					window.addEventListener('scroll', onScroll);
					window.addEventListener('resize', onScroll);
					setInterval(() => {
						if (!scrolling) return;
						scrolling = false;
						maybeReveal();
					}, 200);
					maybeReveal();
				}}
			>
				<table>
					<thead>
						<tr><th>Name</th><th>Email</th><th>ID</th></tr>
					</thead>
					<tbody>
						@for (const contact of contacts; key contact.email) {
							<tr>
								{/* Until the hashes are drawn, a hidden one of the same length holds the column's width, so the table does not reflow. */}
								<td>{contact.name}</td><td>{contact.email}</td><td>{contact.id}@if (!contact.id) {<span aria-hidden="true" style="visibility: hidden">GDB0CF27E9</span>}</td>
							</tr>
						}
					</tbody>
				</table>
				<center><img class={loading ? 'htmx-indicator htmx-request' : 'htmx-indicator'} width="60" src="/img/bars.svg" alt="Loading..." /></center>
			</div>
		</main>
		<SiteFooter />
	</div>
}
