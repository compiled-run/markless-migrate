import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { getModels, INITIAL_CODE, type Entry } from '../../../components/value-select.ts';

export default function ValueSelect() @{
	// What the model select lists: the form's own options until a GET /models has been answered, then the answer's. Each answer
	// is keyed apart, as htmx swaps the select's whole innerHTML and the first new option is then selected.
	let models = state<readonly { readonly key: string; readonly value: string; readonly label: string }[]>([
		{ key: 'a1', value: 'a1', label: 'A1' },
		{ key: 'a3', value: 'a3', label: 'A3' },
		{ key: 'a6', value: 'a6', label: 'A6' },
	]);
	let make = state('audi');
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	let loading = state(false);
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Cascading Selects</h1>
			{" "}
			<p>{"In this example we show how to make the values in one "}<code>select</code>{" depend on the value selected in another "}<code>select</code>.</p>
			{" "}
			<p>{"To begin we start with a default value for the "}<code>make</code>{" select: Audi. We render the "}<code>model</code>{" select for this make. We then have the "}<code>make</code>{" select trigger a "}<code>GET</code>{" to "}<code>/models</code>{" to retrieve the models options and target the "}<code>models</code>{" select."}</p>
			{" "}
			<p>Here is the code:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"label "}</span><span>&gt;Make&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"select "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"\"make\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/models\" "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#models\" "}</span><span style="color:#d19a66;">hx-indicator</span><span>=</span><span style="color:#98c379;">".htmx-indicator"</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"option "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"audi"</span><span>&gt;Audi&lt;/</span><span style="color:#e06c75;">option</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"option "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"toyota"</span><span>&gt;Toyota&lt;/</span><span style="color:#e06c75;">option</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"option "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"bmw"</span><span>&gt;BMW&lt;/</span><span style="color:#e06c75;">option</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">select</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Model&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"select "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"models\" "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"model"</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"option "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"a1"</span><span>&gt;A1&lt;/</span><span style="color:#e06c75;">option</span><span>{">\n"}</span><span>{"      ...\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">select</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"img "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"htmx-indicator\" "}</span><span style="color:#d19a66;">width</span><span>=</span><span style="color:#98c379;">{"\"20\" "}</span><span style="color:#d19a66;">src</span><span>=</span><span style="color:#98c379;">{"\"/img/bars.svg\" "}</span><span style="color:#d19a66;">alt</span><span>=</span><span style="color:#98c379;">"Saving..."</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"When a request is made to the "}<code>/models</code>{" end point, we return the models for that make:"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"option "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'325i'</span><span>&gt;325i&lt;/</span><span style="color:#e06c75;">option</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"option "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'325ix'</span><span>&gt;325ix&lt;/</span><span style="color:#e06c75;">option</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"option "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'X5'</span><span>&gt;X5&lt;/</span><span style="color:#e06c75;">option</span><span>{"> \n"}</span></code></pre>
			{" "}
			<p>{"And they become available in the "}<code>model</code>{" select."}</p>
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
			{/* What the page's init("/demo") wrote into the canvas: its formTemplate(). */}
			<div id="demo-canvas">
				{'  '}
				<h3>Pick A Make/Model</h3>
				{'              \n'}
				<form>
					{'\n  '}
					<div>
						{'\n    '}
						<label>Make</label>
						{'\n    '}
						{/* hx-get="/models" with hx-target="#models" and hx-indicator=".htmx-indicator": a change sends GET /models with the
						    select's value, the answer's options replace the model select's, and the indicator carries htmx-request while it
						    is in flight. */}
						<select
							name="make"
							onChange={(event) => {
								make = (event.target as HTMLSelectElement).value;
								getModels({
									make: () => make,
									logged: () => log.length,
									busy: (on) => (loading = on),
									answer: (found, entry) => {
										log = [entry, ...log];
										selected = entry.id;
										models = found.map((value) => ({ key: `${entry.id}:${value}`, value, label: value }));
									},
								});
							}}
						>
							<option value="audi">Audi</option>
							<option value="toyota">Toyota</option>
							<option value="bmw">BMW</option>
						</select>
						{'\n  '}
					</div>
					{'\n  '}
					<div>
						{'\n    '}
						<label>Model</label>
						{'\n    '}
						<select id="models" name="model">
							@for (const model of models; key model.key) {
								<option value={model.value}>{model.label}</option>
							}
						</select>
						{'\n    '}
						<img class={loading ? 'htmx-indicator htmx-request' : 'htmx-indicator'} width="20" src="/img/bars.svg" alt="Saving..." />
						{'    \n  '}
					</div>
					{'\n'}
				</form>
			</div>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
