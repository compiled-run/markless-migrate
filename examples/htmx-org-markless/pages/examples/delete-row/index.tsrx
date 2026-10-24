import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { CONTACTS, deleteEntry, INITIAL_CODE, type Entry } from '../../../components/delete-row.ts';

export default function DeleteRow() @{
	// Row indexes still in the table, the rows htmx marks htmx-swapping (1 s before the swap removes them), and the
	// buttons whose DELETE is in flight (htmx-request).
	let rows = state<readonly number[]>(CONTACTS.map((_, i) => i));
	let swapping = state<readonly number[]>([]);
	let requesting = state<readonly number[]>([]);
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
			<h1>Delete Row</h1>
			{" "}
			<p>This example shows how to implement a delete button that removes a table row upon completion. First let’s look at the table body:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"table "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"table delete-row-example"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;Name&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;Email&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;Status&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"tbody "}</span><span style="color:#d19a66;">hx-confirm</span><span>=</span><span style="color:#98c379;">{"\"Are you sure?\" "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"closest tr\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML swap:1s"</span><span>{">\n"}</span><span>{"    ...\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">tbody</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">table</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"The table body has a "}<a href="/attributes/hx-confirm/"><code>hx-confirm</code></a>{" attribute to confirm the delete action. It also set the target to be the "}<code>closest tr</code>{" that is, the closest table row, for all the buttons ("}<a href="/attributes/hx-target/"><code>hx-target</code></a>{" is inherited from parents in the DOM.) The swap specification in "}<a href="/attributes/hx-swap/"><code>hx-swap</code></a>{" says to swap the entire target out and to wait 1 second after receiving a response. This last bit is so that we can use the following CSS:"}</p>
			{" "}
			<pre data-lang="css" style="background-color:#1f2329;color:#abb2bf;" class="language-css "><code class="language-css" data-lang="css"><span style="color:#e06c75;">tr</span><span style="color:#d19a66;">{".htmx-swapping "}</span><span style="color:#e06c75;">{"td "}</span><span>{"{\n"}</span><span>{"  opacity: "}</span><span style="color:#d19a66;">0</span><span>{";\n"}</span><span>{"  transition: opacity "}</span><span style="color:#d19a66;">{"1s "}</span><span>{"ease-out;\n"}</span><span>{"}\n"}</span></code></pre>
			{" "}
			<p>To fade the row out before it is swapped/removed.</p>
			{" "}
			<p>{"Each row has a button with a "}<a href="/attributes/hx-delete/"><code>hx-delete</code></a>{" attribute containing the url on which to issue a "}<code>DELETE</code>{" request to delete the row from the server. This request responds with a "}<code>200</code>{" status code and empty content, indicating that the row should be replaced with nothing."}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;Angie MacDowell&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;angie&#64;macdowell.org&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;Active&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn danger\" "}</span><span style="color:#d19a66;">hx-delete</span><span>=</span><span style="color:#98c379;">"/contact/1"</span><span>{">\n"}</span><span>{"      Delete\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span></code></pre>
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
			{" "}
			<h2><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">🔗</a>Demo</h2>
			{" "}
			{/* The page's init("/demo") wrote this table as it loaded. */}
			<div id="demo-canvas">
				<table class="table delete-row-example">
					<thead>
						<tr>
							<th>Name</th>
							<th>Email</th>
							<th>Status</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						@for (const i of rows; key i) {
							<tr class={swapping.includes(i) ? 'htmx-swapping' : undefined}>
								<td>{CONTACTS[i]!.name}</td>
								<td>{CONTACTS[i]!.email}</td>
								<td>{CONTACTS[i]!.status}</td>
								<td>
									{/* hx-delete="/contact/N" under the body's hx-confirm, hx-target="closest tr" and hx-swap="outerHTML swap:1s":
									    the fake server answers the DELETE after 80 ms with nothing (the button carries htmx-request until then),
									    the row is htmx-swapping for 1 s, so its cells fade out, and is then removed. */}
									<button
										class={requesting.includes(i) ? 'btn danger htmx-request' : 'btn danger'}
										onClick={() => {
											if (requesting.includes(i) || !window.confirm('Are you sure?')) return;
											requesting = [...requesting, i];
											setTimeout(() => {
												log = [deleteEntry(log.length + 1, i), ...log];
												selected = `req-${log.length}`;
												requesting = requesting.filter((r) => r !== i);
												swapping = [...swapping, i];
												setTimeout(() => {
													rows = rows.filter((r) => r !== i);
													swapping = swapping.filter((r) => r !== i);
												}, 1000);
											}, 80);
										}}
									>
										{'\n          Delete\n        '}
									</button>
								</td>
							</tr>
						}
					</tbody>
				</table>
			</div>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
