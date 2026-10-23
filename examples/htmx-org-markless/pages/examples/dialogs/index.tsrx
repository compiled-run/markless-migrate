import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { INITIAL_CODE, submitEntry, type Entry } from '../../../components/dialogs.ts';

export default function Dialogs() @{
	// The page's sinon server and demo.js log in Markless state: whether the POST is in flight
	// (htmx-request), the log entries and the one shown.
	let loading = state(false);
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const target = element<HTMLDivElement>();
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Dialogs</h1>
			{" "}
			<p>{"Dialogs can be triggered with the "}<a href="/attributes/hx-prompt/"><code>hx-prompt</code></a>{" and "}<a href="/attributes/hx-confirm/"><code>hx-confirm</code></a>attributes. These are triggered by the user interaction that would trigger the AJAX request, but the request is only sent if the dialog is accepted.</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn primary\"\n"}</span><span>{"          "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/submit\"\n"}</span><span>{"          "}</span><span style="color:#d19a66;">hx-prompt</span><span>=</span><span style="color:#98c379;">{"\"Enter a string\"\n"}</span><span>{"          "}</span><span style="color:#d19a66;">hx-confirm</span><span>=</span><span style="color:#98c379;">{"\"Are you sure?\"\n"}</span><span>{"          "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"#response"</span><span>{">\n"}</span><span>{"    Prompt Submission\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"response"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"The value provided by the user to the prompt dialog is sent to the server in a "}<code>HX-Prompt</code>{" header. In this case, the server simply echos the user input back."}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>User entered &lt;</span><span style="color:#e06c75;">i</span><span>&gt;$&#123;response&#125;&lt;/</span><span style="color:#e06c75;">i</span><span>{">\n"}</span></code></pre>
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
			<div id="demo-canvas">
				<div>
					{'\n  '}
					{/* hx-post="/submit" with hx-prompt and hx-confirm: htmx asks the prompt first and then the confirm, and sends
					    nothing when either is dismissed; the answer goes in the HX-Prompt header, the fake server echoes it after
					    80 ms (the button carries htmx-request until then) and it replaces #response's content. */}
					<button
						class={loading ? 'btn primary htmx-request' : 'btn primary'}
						onClick={() => {
							if (loading) return;
							const answer = window.prompt('Enter a string');
							if (answer === null || !window.confirm('Are you sure?')) return;
							loading = true;
							setTimeout(() => {
								log = [submitEntry(log.length + 1, answer), ...log];
								selected = `req-${log.length}`;
								const italic = document.createElement('i');
								italic.textContent = answer;
								target?.replaceChildren('User entered ', italic);
								loading = false;
							}, 80);
						}}
					>
						{'\n    Prompt Submission\n  '}
					</button>
					{'\n  '}
					<div id="response" el={target}></div>
					{'\n'}
				</div>
			</div>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
