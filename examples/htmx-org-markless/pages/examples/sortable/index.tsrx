import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { FIRST_ITEMS, formItems, INITIAL_CODE, postEntry, type Entry } from '../../../components/sortable.ts';

const SORTABLE = 'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js';

interface SortableInstance {
	option(name: string, value: unknown): void;
}
type SortableClass = new (el: HTMLElement, options: Record<string, unknown>) => SortableInstance;

// The page loads Sortable.min.js as htmx.org's does; a page swapped in by the router has not run that tag, so it is added then.
function loadSortable(): Promise<SortableClass> {
	const loaded = (window as { Sortable?: SortableClass }).Sortable;
	if (loaded) return Promise.resolve(loaded);
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = SORTABLE;
		script.onload = () => resolve((window as { Sortable?: SortableClass }).Sortable!);
		script.onerror = reject;
		document.head.append(script);
	});
}

export default function SortablePage() @{
	// Each answer replaces the form's rows, as htmx swapped the response into it: new keys, so no row Sortable moved is reused.
	let rows = state(FIRST_ITEMS.map((value) => ({ key: `0-${value}`, value })));
	let loading = state(false);
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
			<h1>Sortable</h1>
			<p>{"In this example we show how to integrate the "}<a rel="noopener" target="_blank" href="https://sortablejs.github.io/Sortable/">Sortable</a>{" javascript library with htmx."}</p>
			<p>{"To begin we initialize the "}<code>.sortable</code>{" class with the "}<code>Sortable</code>{" javascript library:"}</p>
			<pre data-lang="js" style="background-color:#1f2329;color:#abb2bf;" class="language-js "><code class="language-js" data-lang="js"><span style="color:#e06c75;">htmx</span><span>.</span><span style="color:#56b6c2;">onLoad</span><span>(</span><span style="color:#c678dd;">function</span><span>(</span><span style="color:#e06c75;">content</span><span>{") {\n"}</span><span>{"    "}</span><span style="color:#c678dd;">{"var "}</span><span style="color:#e06c75;">{"sortables "}</span><span>{"= "}</span><span style="color:#e06c75;">content</span><span>.</span><span style="color:#56b6c2;">querySelectorAll</span><span>(</span><span style="color:#98c379;">".sortable"</span><span>{");\n"}</span><span>{"    "}</span><span style="color:#c678dd;">{"for "}</span><span>(</span><span style="color:#c678dd;">{"var "}</span><span style="color:#e06c75;">{"i "}</span><span>{"= "}</span><span style="color:#d19a66;">0</span><span>{"; "}</span><span style="color:#e06c75;">{"i "}</span><span>{"< "}</span><span style="color:#e06c75;">sortables</span><span>{".length; "}</span><span style="color:#e06c75;">i</span><span>{"++) {\n"}</span><span>{"      "}</span><span style="color:#c678dd;">{"var "}</span><span style="color:#e06c75;">{"sortable "}</span><span>{"= "}</span><span style="color:#e06c75;">sortables</span><span>[</span><span style="color:#e06c75;">i</span><span>{"];\n"}</span><span>{"      "}</span><span style="color:#c678dd;">{"var "}</span><span style="color:#e06c75;">{"sortableInstance "}</span><span>= new Sortable(</span><span style="color:#e06c75;">sortable</span><span>{", {\n"}</span><span>{"          animation: "}</span><span style="color:#d19a66;">150</span><span>{",\n"}</span><span>{"          ghostClass: "}</span><span style="color:#98c379;">'blue-background-class'</span><span>{",\n"}</span><span>{"\n"}</span><span>{"          "}</span><span style="font-style:italic;color:#848da1;">{"// Make the `.htmx-indicator` unsortable\n"}</span><span>{"          filter: "}</span><span style="color:#98c379;">".htmx-indicator"</span><span>{",\n"}</span><span>{"          "}</span><span style="color:#61afef;">onMove</span><span>{": "}</span><span style="color:#c678dd;">{"function "}</span><span>(</span><span style="color:#e06c75;">evt</span><span>{") {\n"}</span><span>{"            "}</span><span style="color:#c678dd;">{"return "}</span><span style="color:#e06c75;">evt</span><span>.</span><span style="color:#e06c75;">related</span><span>.className.</span><span style="color:#56b6c2;">indexOf</span><span>(</span><span style="color:#98c379;">'htmx-indicator'</span><span>) === -</span><span style="color:#d19a66;">1</span><span>{";\n"}</span><span>{"          },\n"}</span><span>{"\n"}</span><span>{"          "}</span><span style="font-style:italic;color:#848da1;">{"// Disable sorting on the `end` event\n"}</span><span>{"          "}</span><span style="color:#61afef;">onEnd</span><span>{": "}</span><span style="color:#c678dd;">{"function "}</span><span>(</span><span style="color:#e06c75;">evt</span><span>{") {\n"}</span><span>{"            "}</span><span style="color:#e06c75;">this</span><span>.</span><span style="color:#61afef;">option</span><span>(</span><span style="color:#98c379;">"disabled"</span><span>{", "}</span><span style="color:#d19a66;">true</span><span>{");\n"}</span><span>{"          }\n"}</span><span>{"      });\n"}</span><span>{"\n"}</span><span>{"      "}</span><span style="font-style:italic;color:#848da1;">{"// Re-enable sorting on the `htmx:afterSwap` event\n"}</span><span>{"      "}</span><span style="color:#e06c75;">sortable</span><span>.</span><span style="color:#56b6c2;">addEventListener</span><span>(</span><span style="color:#98c379;">"htmx:afterSwap"</span><span>{", "}</span><span style="color:#c678dd;">function</span><span>{"() {\n"}</span><span>{"        "}</span><span style="color:#e06c75;">sortableInstance</span><span>.</span><span style="color:#61afef;">option</span><span>(</span><span style="color:#98c379;">"disabled"</span><span>{", "}</span><span style="color:#d19a66;">false</span><span>{");\n"}</span><span>{"      });\n"}</span><span>{"    }\n"}</span><span>{"})\n"}</span></code></pre>
			<p>{"Next, we create a form that has some sortable divs within it, and we trigger an ajax request on the "}<code>end</code>{" event, fired by Sortable.js:"}</p>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"form "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"sortable\" "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/items\" "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">"end"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"htmx-indicator"</span><span>&gt;Updating...&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"'hidden' "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"'item' "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'1'</span><span>/&gt;Item 1&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"'hidden' "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"'item' "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'2'</span><span>/&gt;Item 2&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"'hidden' "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"'item' "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'3'</span><span>/&gt;Item 3&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"'hidden' "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"'item' "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'4'</span><span>/&gt;Item 4&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"'hidden' "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"'item' "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'5'</span><span>/&gt;Item 5&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">form</span><span>{">\n"}</span></code></pre>
			<p>Note that each div has a hidden input inside of it that specifies the item id for that row.</p>
			<p>{"When the list is reordered via the Sortable.js drag-and-drop, the "}<code>end</code>{" event will be fired. htmx will then post the item ids in the new order to "}<code>/items</code>, to be persisted by the server.</p>
			<p>That’s it!</p>
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
			<div id="demo-canvas">
				{/* hx-post="/items" hx-trigger="end": when Sortable fires "end" the form posts its item ids in their new order, carries
				    htmx-request (its indicator shows) until the fake server answers 80 ms later, and the answer's rows replace its own. */}
				<form
					el={form}
					id="example1"
					class={loading ? 'list-group col sortable htmx-request' : 'list-group col sortable'}
					onIdle={async () => {
						const Sortable = await loadSortable();
						if (!form) return;
						const sortable = new Sortable(form, {
							animation: 150,
							ghostClass: 'blue-background-class',
							// The indicator is not sortable.
							filter: '.htmx-indicator',
							onMove: (evt: { related: Element }) => evt.related.className.indexOf('htmx-indicator') === -1,
							// Sorting stays off until the answer is in.
							onEnd: () => sortable.option('disabled', true),
						});
						form.addEventListener('end', () => {
							if (loading) return;
							const items = formItems(form);
							loading = true;
							setTimeout(() => {
								const entry = postEntry(log.length + 1, items);
								log = [entry, ...log];
								selected = entry.id;
								const generation = log.length;
								rows = items.map((value) => ({ key: `${generation}-${value}`, value }));
								loading = false;
								sortable.option('disabled', false);
							}, 80);
						});
					}}
				>
					<div class="htmx-indicator" style="cursor: default">Updating...</div>
					@for (const row of rows; key row.key) {
						<div style="border:1px solid #DEDEDE; padding:12px; margin: 8px; width:200px; cursor: grab" ondrag="this.style.cursor = 'grabbing'">
							<input type="hidden" name="item" value={row.value} />
							{` Item ${row.value}`}
						</div>
					}
				</form>
			</div>
			<script src={SORTABLE}></script>
		</main>
		<SiteFooter />
	</div>
}
