import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { INITIAL_CODE, submitUsers, type Entry } from '../../../components/bulk-update.ts';

export default function BulkUpdate() @{
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	let loading = state(false);
	let toast = state('');
	// htmx's settle:3s: #toast carries htmx-settling for 3 s after each swap; each swap's own timer takes it off.
	let settling = state(0);
	const form = element<HTMLFormElement>();
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Bulk Update</h1>
			{" "}
			<p>This demo shows how to implement a common pattern where rows are selected and then bulk updated. This is accomplished by putting a form around a table, with checkboxes in the table, and then including the checked values in the form submission (<code>POST</code>{" request):"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"form "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"checked-contacts\"\n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/users\"\n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"innerHTML settle:3s\"\n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"#toast"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">table</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">th</span><span>&gt;Name&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">th</span><span>&gt;Email&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">th</span><span>&gt;Active&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      </"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"      </"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"tbody "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"tbody"</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"          <"}</span><span style="color:#e06c75;">td</span><span>&gt;Joe Smith&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"          <"}</span><span style="color:#e06c75;">td</span><span>&gt;joe&#64;smith.org&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"          <"}</span><span style="color:#e06c75;">td</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"checkbox\" "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"active:joe&#64;smith.org"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"        </"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"        ...\n"}</span><span>{"      </"}</span><span style="color:#e06c75;">tbody</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">table</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"submit\" "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">{"\"Bulk Update\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn primary"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"output "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"toast"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">output</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">form</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"The server will bulk-update the statuses based on the values of the checkboxes. We respond with a small toast message about the update to inform the user, and use an "}<code>&lt;output&gt;</code>{" element to politely announce the update for accessibility. Note that the "}<code>&lt;output&gt;</code>{" element is appropriate for announcing the result of an action in a specific form, but if you need to announce general-purpose messages that are not connected to a form it would make sense to use an ARIA live region, eg "}<code>&lt;p id="toast" aria-live="polite"&gt;&lt;/p&gt;</code>.</p>
			{" "}
			<pre data-lang="css" style="background-color:#1f2329;color:#abb2bf;" class="language-css "><code class="language-css" data-lang="css"><span style="color:#d19a66;">{"#toast.htmx-settling "}</span><span>{"{\n"}</span><span>{"  opacity: "}</span><span style="color:#d19a66;">100</span><span>{";\n"}</span><span>{"}\n"}</span><span>{"\n"}</span><span style="color:#d19a66;">{"#toast "}</span><span>{"{\n"}</span><span>{"  background: "}</span><span style="color:#56b6c2;">#E1F0DA</span><span>{";\n"}</span><span>{"  opacity: "}</span><span style="color:#d19a66;">0</span><span>{";\n"}</span><span>{"  transition: opacity "}</span><span style="color:#d19a66;">{"3s "}</span><span>{"ease-out;\n"}</span><span>{"}\n"}</span></code></pre>
			{" "}
			<p>The cool thing is that, because HTML form inputs already manage their own state, we don’t need to re-render any part of the users table. The active users are already checked and the inactive ones unchecked!</p>
			{" "}
			<p>You can see a working example of this code below.</p>
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
			{/* What the page's init("/demo") wrote into the canvas: its displayUI(). */}
			<div id="demo-canvas">
				<h3>Select Rows And Activate Or Deactivate Below</h3>
				{'\n               '}
				{/* hx-post="/users" with hx-swap="innerHTML settle:3s" and hx-target="#toast": the fake server answers after 80 ms
				    with the counts, the form carries htmx-request until then, and the answer goes into #toast. */}
				<form
					el={form}
					id="checked-contacts"
					class={loading ? 'htmx-request' : ''}
					onSubmit={(event) => {
						event.preventDefault();
						submitUsers({
							form: () => form,
							logged: () => log.length,
							busy: (on) => (loading = on),
							answer: (response, entry) => {
								log = [entry, ...log];
								selected = entry.id;
								toast = response;
								settling = settling + 1;
								setTimeout(() => (settling = settling - 1), 3000);
							},
						});
					}}
				>
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Active</th>
							</tr>
						</thead>
						<tbody id="tbody">
							<tr>
								<td>Joe Smith</td>
								<td>joe@smith.org</td>
								<td>
									<input type="checkbox" name="active:joe@smith.org" checked="" />
								</td>
							</tr>
							<tr>
								<td>Angie MacDowell</td>
								<td>angie@macdowell.org</td>
								<td>
									<input type="checkbox" name="active:angie@macdowell.org" checked="" />
								</td>
							</tr>
							<tr>
								<td>Fuqua Tarkenton</td>
								<td>fuqua@tarkenton.org</td>
								<td>
									<input type="checkbox" name="active:fuqua@tarkenton.org" checked="" />
								</td>
							</tr>
							<tr>
								<td>Kim Yee</td>
								<td>kim@yee.org</td>
								<td>
									<input type="checkbox" name="active:kim@yee.org" />
								</td>
							</tr>
						</tbody>
					</table>
					{'\n                '}
					<input type="submit" value="Bulk Update" class="btn primary" />
					{'\n                '}
					<output id="toast" class={settling > 0 ? 'htmx-settling' : ''}>{toast}</output>
					{'\n              '}
				</form>
				{'\n              '}
				<br />
			</div>
		</main>
		<SiteFooter />
	</div>
}
