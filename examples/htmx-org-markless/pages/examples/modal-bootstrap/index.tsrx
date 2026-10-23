import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { INITIAL_CODE, modalEntry, RESPONSE_DELAY, swapModal, type Entry } from '../../../components/modal-bootstrap.ts';

export default function ModalBootstrap() @{
	// The page's sinon server and demo.js log in Markless state: whether the GET is in flight (htmx-request), the log
	// entries and the one shown. Bootstrap's own script opens and closes the modal, as it does on htmx.org.
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
			<h1>Modal Dialogs in Bootstrap</h1>
			{" "}
			<p>Many CSS toolkits include styles (and Javascript) for creating modal dialog boxes. This example shows how to use HTMX alongside original JavaScript provided by Bootstrap.</p>
			{" "}
			<p>We start with a button that triggers the dialog, along with a DIV at the bottom of your markup where the dialog will be loaded:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"button\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/modal\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#modals-here\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"click\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">data-bs-toggle</span><span>=</span><span style="color:#98c379;">{"\"modal\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">data-bs-target</span><span>=</span><span style="color:#98c379;">{"\"#modals-here\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn primary"</span><span>&gt;Open Modal&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"modals-here\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"modal modal-blur fade\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">style</span><span>=</span><span style="color:#98c379;">"</span><span>display: none</span><span style="color:#98c379;">{"\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">aria-hidden</span><span>=</span><span style="color:#98c379;">{"\"false\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">tabindex</span><span>=</span><span style="color:#98c379;">"-1"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"modal-dialog modal-lg modal-dialog-centered\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">"document"</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"modal-content"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"This button uses a "}<code>GET</code>{" request to "}<code>/modal</code>{" when this button is clicked. The contents of this file will be added to the DOM underneath the "}<code>#modals-here</code>{" DIV."}</p>
			{" "}
			<p>The server responds with a slightly modified version of Bootstrap’s standard modal</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"modal-dialog modal-dialog-centered"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"modal-content"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"modal-header"</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"h5 "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"modal-title"</span><span>&gt;Modal title&lt;/</span><span style="color:#e06c75;">h5</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"modal-body"</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">p</span><span>&gt;Modal body text goes here.&lt;/</span><span style="color:#e06c75;">p</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"modal-footer"</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"button\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn btn-secondary\" "}</span><span style="color:#d19a66;">data-bs-dismiss</span><span>=</span><span style="color:#98c379;">"modal"</span><span>&gt;Close&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			{/* Bootstrap owns this element's class, style and ARIA attributes once it opens the modal; the swap only replaces
			    its content. */}
			<div el={target} id="modals-here" class="modal modal-blur fade" style="display: none" aria-hidden="false" tabindex="-1">{" "}<div class="modal-dialog modal-lg modal-dialog-centered" role="document">{" "}<div class="modal-content"></div>{" "}</div>{" "}</div>
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
				{/* hx-get="/modal" hx-target="#modals-here": the fake server answers after 80 ms (the button carries htmx-request
				    until then; a click while it is in flight sends nothing, as htmx drops it) and the answer replaces
				    #modals-here's content (swapModal). data-bs-toggle and
				    data-bs-target are Bootstrap's: its own click handler shows the modal. */}
				<button
					hx-get="/modal"
					hx-target="#modals-here"
					hx-trigger="click"
					data-bs-toggle="modal"
					data-bs-target="#modals-here"
					class={loading ? 'btn primary htmx-request' : 'btn primary'}
					onClick={() => {
						if (loading) return;
						loading = true;
						setTimeout(() => {
							log = [modalEntry(log.length + 1), ...log];
							selected = `req-${log.length}`;
							loading = false;
							if (target) swapModal(target);
						}, RESPONSE_DELAY);
					}}
				>
					Open Modal
				</button>
				{'\n\t'}
			</div>
			{" "}
			{" "}
			<script src={"https://cdn.jsdelivr.net/npm/bootstrap@5.2.2/dist/js/bootstrap.bundle.min.js"} integrity="sha384-OERcA2EqjJCMA+/3y+gxIOqMEjwtxJY7qPCqsdltbNJuaOe923+mo//f6V8Qbsw3" crossorigin="anonymous"></script>
			{" "}
			{" "}
		</main>
		<SiteFooter />
	</div>
}
