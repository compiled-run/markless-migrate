import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { INITIAL_CODE, postNote, type Entry } from '../../../components/reset-user-input.ts';

export default function ResetUserInput() @{
	// The page's sinon server and demo.js log in Markless state: whether the POST is in flight (htmx-request on the form),
	// a submit htmx queued behind it, the notes the answers added, the log entries and the one shown.
	let loading = state(false);
	let queued = state(false);
	let notes = state<{ readonly id: number; readonly text: string }[]>([]);
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const form = element<HTMLFormElement>();
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Reset user input</h1>
			{" "}
			<p>{"This example shows how to easily reset user inputs using "}<a href="/attributes/hx-on/"><code>hx-on</code></a>, allowing users to make multiple requests without having to manually delete their previous inputs.</p>
			{" "}
			<p>{"The inline script will run on the "}<a href="/events/#htmx:afterRequest"><code>afterRequest</code></a>{" event and ensures that the form will reset to its initial state as long as the response has a 20x status code:"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"form "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/note\"\n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#notes\" \n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"afterbegin\"\n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-on::after-request</span><span>=</span><span style="color:#98c379;">"if(event.detail.successful) this.reset()"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"form-group"</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">label</span><span>&gt;Add a note&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"text\" "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"\"note-text\" "}</span><span style="color:#d19a66;">placeholder</span><span>=</span><span style="color:#98c379;">"blank canvas"</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn"</span><span>&gt;Add&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">form</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"ul "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"notes"</span><span>&gt;</span><span style="font-style:italic;color:#848da1;">&lt;!-- Response will go here --&gt;</span><span>&lt;/</span><span style="color:#e06c75;">ul</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"The "}<code>reset()</code>{" method is only available on "}<code>form</code>{" elements. For other elements, the input value can explicitly selected and reset to a default to achieve the same result. The following code is functionally equivalent:"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Add a note&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"note-input\" "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"text\" "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"\"note-text\" "}</span><span style="color:#d19a66;">placeholder</span><span>=</span><span style="color:#98c379;">"blank canvas"</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn primary\" \n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/note\" \n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#note\" \n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"afterbegin\" \n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-include</span><span>=</span><span style="color:#98c379;">{"\"#note-input\"\n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-on::after-request</span><span>=</span><span style="color:#98c379;">{"\"if(event.detail.successful)\n"}</span><span style="color:#98c379;">{"            document.getElementById('note-input').value = ''\""}</span><span>{">\n"}</span><span>{"    Add\n"}</span><span>&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"ul "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"notes"</span><span>&gt;</span><span style="font-style:italic;color:#848da1;">&lt;!-- Response will go here --&gt;</span><span>&lt;/</span><span style="color:#e06c75;">ul</span><span>{">\n"}</span></code></pre>
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
										<pre class="language-html"><code class="language-html">{entry.code}</code>{entry.truncated ? '' : ' '}</pre>
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
			{/* What the page's init("/demo") wrote into the canvas: its formTemplate(). */}
			<div id="demo-canvas">
				{'\n'}
				<form
					el={form}
					class={loading ? 'htmx-request' : undefined}
					onSubmit={(event) => {
						// hx-post="/note" on the form's submit: htmx posts its fields, the fake server answers 80 ms later, the answer
						// goes at the start of #notes (hx-swap="afterbegin") and hx-on::after-request resets the form on the 200. A
						// submit while one is in flight waits for it (htmx's default queue) and is sent with the fields as they are then.
						event.preventDefault();
						if (loading) {
							queued = true;
							return;
						}
						if (!form) return;
						const fields = [...new FormData(form)].map(([name, value]) => [name, String(value)] as const);
						loading = true;
						setTimeout(() => {
							const { note, entry } = postNote(log.length + 1, fields);
							if (note !== null) notes = [{ id: log.length + 1, text: note }, ...notes];
							log = [entry, ...log];
							selected = entry.id;
							loading = false;
							form?.reset();
							if (queued) {
								queued = false;
								form?.requestSubmit();
							}
						}, 80);
					}}
				>
					{'\n    '}
					<div class="form-group">
						{'\n        '}
						<label>Add a note</label>
						{'\n        '}
						<input type="text" name="note-text" placeholder="blank canvas" />
						{'\n    '}
					</div>
					{'\n    '}
					<button class="btn primary">Add</button>
					{'\n'}
				</form>
				{'\n'}
				<ul id="notes">
					@for (const note of notes; key note.id) {
						<li>{note.text}</li>
					}
					{' '}
				</ul>
			</div>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
