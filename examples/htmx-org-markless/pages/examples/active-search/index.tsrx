import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { afterTyping, INITIAL_CODE, LOADED, postSearch, type Contact, type Entry } from '../../../components/active-search.ts';

export default function ActiveSearch() @{
	// The input's hx-trigger="load" request has been answered by the time a visitor sees the page: all contacts, logged as req-1.
	let contacts = state<readonly Contact[]>(LOADED.contacts);
	let log = state<Entry[]>([LOADED.entry]);
	let selected = state('req-1');
	let showInfo = state(false);
	let loading = state(false);
	let lastValue = state<string | null>(null);
	const input = element<HTMLInputElement>();
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Active Search</h1>
			<p>This example actively searches a contacts database as the user enters text.</p>
			{" "}
			<p>We start with a search input and an empty table:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">h3</span><span>{">\n"}</span><span>{"  Search Contacts\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"span "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"htmx-indicator"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"img "}</span><span style="color:#d19a66;">src</span><span>=</span><span style="color:#98c379;">{"\"/img/bars.svg\" "}</span><span style="color:#d19a66;">alt</span><span>=</span><span style="color:#98c379;">""</span><span>{"/> Searching...\n"}</span><span>{"   </"}</span><span style="color:#e06c75;">span</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">h3</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"form-control\" "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"search\"\n"}</span><span>{"       "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"\"search\" "}</span><span style="color:#d19a66;">placeholder</span><span>=</span><span style="color:#98c379;">{"\"Begin Typing To Search Users...\"\n"}</span><span>{"       "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/search\"\n"}</span><span>{"       "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"input changed delay:500ms, keyup[key=='Enter'], load\"\n"}</span><span>{"       "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#search-results\"\n"}</span><span>{"       "}</span><span style="color:#d19a66;">hx-indicator</span><span>=</span><span style="color:#98c379;">".htmx-indicator"</span><span>{">\n"}</span><span>{"\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"table "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"table"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;First Name&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;Last Name&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;Email&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"tbody "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"search-results"</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">tbody</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">table</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"The input issues a "}<code>POST</code>{" to "}<code>/search</code>{" on the "}<a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/input_event"><code>input</code></a>{" event and sets the body of the table to be the resulting content."}</p>
			{" "}
			<p>{"We add the "}<code>delay:500ms</code>{" modifier to the trigger to delay sending the query until the user stops typing. Additionally, we add the "}<code>changed</code>{" modifier to the trigger to ensure we don’t send new queries when the user doesn’t change the value of the input (e.g. they hit an arrow key, or pasted the same value)."}</p>
			{" "}
			<p>We can use multiple triggers by separating them with a comma, this way we add 2 more triggers:</p>
			{" "}
			<ul>{" "}<li><code>keyup[key=='Enter']</code>{" triggers once enter is pressed. We use "}<a href="/attributes/hx-trigger#standard-event-filters">event filters</a>{" here to check for "}<a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key">the key property in the KeyboardEvent object</a>.</li>{" "}<li><code>load</code>{" in order to show all results initially on load."}</li>{" "}</ul>
			{" "}
			<p>{"Finally, we show an indicator when the search is in flight with the "}<code>hx-indicator</code>{" attribute."}</p>
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
			{/* What the page's init("/init") wrote into the canvas: its searchUI(). */}
			<div id="demo-canvas">
				{'  '}
				<h3>
					{'\nSearch Contacts\n'}
					<span class={loading ? 'htmx-indicator htmx-request' : 'htmx-indicator'}>
						{'\n'}
						<img src="/img/bars.svg" alt="" />
						{' Searching...\n'}
					</span>
					{'\n'}
				</h3>
				{'\n\n'}
				{/* hx-post="/search" with hx-trigger="input changed delay:500ms, keyup[key=='Enter']", hx-target="#search-results" and
				    hx-indicator=".htmx-indicator": an input event with a value other than the last one sends the search 500 ms after the
				    last such event, Enter sends it at once, and the indicator carries htmx-request while it is in flight. */}
				<input
					el={input}
					class="form-control"
					type="search"
					name="search"
					placeholder="Begin Typing To Search Users..."
					onInput={(event) => {
						const value = (event.target as HTMLInputElement).value;
						if (value === lastValue) return;
						lastValue = value;
						afterTyping(() =>
							postSearch({
								value: () => input?.value ?? '',
								logged: () => log.length,
								busy: (on) => (loading = on),
								answer: (found, entry) => {
									log = [entry, ...log];
									selected = entry.id;
									contacts = found;
								},
							}),
						);
					}}
					onKeyUp={(event) => {
						if ((event as KeyboardEvent).key !== 'Enter') return;
						postSearch({
							value: () => input?.value ?? '',
							logged: () => log.length,
							busy: (on) => (loading = on),
							answer: (found, entry) => {
								log = [entry, ...log];
								selected = entry.id;
								contacts = found;
							},
						});
					}}
				/>
				{'\n\n'}
				<table class="table">
					<thead>
						<tr>
							<th>First Name</th>
							<th>Last Name</th>
							<th>Email</th>
						</tr>
					</thead>
					<tbody id="search-results">
						@for (const contact of contacts; key contact.Email) {
							<tr><td>{contact.FirstName}</td><td>{contact.LastName}</td><td>{contact.Email}</td></tr>
						}
					</tbody>
				</table>
			</div>
		</main>
		<SiteFooter />
	</div>
}
