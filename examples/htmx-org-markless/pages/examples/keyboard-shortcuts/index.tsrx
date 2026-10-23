import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { DID_IT, INITIAL_CODE, isShortcut, postDoit, type Entry } from '../../../components/keyboard-shortcuts.ts';

export default function KeyboardShortcuts() @{
	let label = state('Do It! (alt-shift-D) ');
	let loading = state(false);
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
			<h1>Keyboard Shortcuts</h1>
			<p>In this example we show how to create a keyboard shortcut for an action.</p>
			<p>We start with a simple button that loads some content from the server:</p>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn primary\" "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"click, keyup[altKey&&shiftKey&&code=='KeyD'] from:body\"\n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">"/doit"</span><span>&gt;Do It! (alt-shift-D)&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span></code></pre>
			<p>{"Note that the button responds to both the "}<code>click</code>{" event (as usual) and also the keyup event when "}<code>alt-shift-D</code>{" is pressed. The "}<code>from:</code>{" modifier is used to listen for the keyup event on the "}<code>body</code>{" element, thus making it a “global” keyboard shortcut."}</p>
			<p>You can trigger the demo below by either clicking on the button, or by hitting alt-shift-D.</p>
			<p>You can find out the conditions needed for a given keyboard shortcut here:</p>
			<p><a rel="noopener" target="_blank" href="https://javascript.info/keyboard-events">{"https://javascript.info/keyboard-events"}</a></p>
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
										<b>POST</b>{' /doit'}
									</div>
									<div>{'parameters: {}'}</div>
									<div>{'headers: {}'}</div>
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
			{/* keyup[...] from:body: the shortcut is heard on the body for as long as the page is shown. */}
			<div
				id="demo-canvas"
				attach={() => {
					const body = document.body;
					const onKeyUp = (event: KeyboardEvent) => {
						if (!isShortcut(event)) return;
						postDoit({
							logged: () => log.length,
							busy: (on) => (loading = on),
							answer: (entry) => {
								log = [entry, ...log];
								selected = entry.id;
								label = DID_IT;
							},
						});
					};
					body.addEventListener('keyup', onKeyUp);
					return () => body.removeEventListener('keyup', onKeyUp);
				}}
			>
				<button
					class={loading ? 'btn primary htmx-request' : 'btn primary'}
					style="font-size:20pt"
					onClick={() =>
						postDoit({
							logged: () => log.length,
							busy: (on) => (loading = on),
							answer: (entry) => {
								log = [entry, ...log];
								selected = entry.id;
								label = DID_IT;
							},
						})
					}
				>
					{label}
				</button>
			</div>
		</main>
		<SiteFooter />
	</div>
}
