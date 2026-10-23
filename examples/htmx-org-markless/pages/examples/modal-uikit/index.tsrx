import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { INITIAL_CODE, modalEntry, RESPONSE_DELAY, swapModal, type Entry } from '../../../components/modal-uikit.ts';

export default function ModalUikit() @{
	// The page's sinon server and demo.js log in Markless state: whether the GET is in flight (htmx-request), the log
	// entries and the one shown. The answer replaces #modals-here's content and its hyperscript runs as plain DOM work
	// (swapModal); UIKit's stylesheet animates the modal from its classes.
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
			<h1>Modal Dialogs with UIKit</h1>
			{" "}
			<p>Many CSS toolkits include styles (and Javascript) for creating modal dialog boxes. This example shows how to use HTMX to display dynamic dialog using UIKit, and how to trigger its animation styles with little or no Javascript.</p>
			{" "}
			<p>We start with a button that triggers the dialog, along with a DIV at the bottom of your markup where the dialog will be loaded:</p>
			{" "}
			<p>{"This is an example of using HTMX to remotely load modal dialogs using UIKit. In this example we will use "}<a rel="noopener" target="_blank" href="https://hyperscript.org">Hyperscript</a>{" to demonstrate how cleanly that scripting language allows you to glue htmx and other libraries together."}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"button \n"}</span><span>{"\t"}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"showButton\"\n"}</span><span>{"\t"}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/uikit-modal.html\" \n"}</span><span>{"\t"}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"#modals-here\" \n"}</span><span>{"\t"}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"uk-button uk-button-primary\" \n"}</span><span>{"\t"}</span><span style="color:#d19a66;">_</span><span>=</span><span style="color:#98c379;">"on htmx:afterOnLoad wait 10ms then add .uk-open to #modal"</span><span>&gt;Open Modal&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">"modals-here"</span><span>&gt;&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"This button uses a "}<code>GET</code>{" request to "}<code>/uikit-modal.html</code>{" when this button is clicked. The contents of this file will be added to the DOM underneath the "}<code>#modals-here</code>{" DIV."}</p>
			{" "}
			<p>Rather than using the standard UIKit Javascript library we are using a bit of Hyperscript, which triggers UIKit’s smooth animations. It is delayed by 10ms so that UIKit’s animations will run correctly.</p>
			{" "}
			<p>Finally, the server responds with a slightly modified version of UIKit’s standard modal</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"modal\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"uk-modal\" "}</span><span style="color:#d19a66;">style</span><span>=</span><span style="color:#98c379;">"</span><span>display:block;</span><span style="color:#98c379;">"</span><span>{">\n"}</span><span>{"\t<"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"uk-modal-dialog uk-modal-body"</span><span>{">\n"}</span><span>{"\t\t<"}</span><span style="color:#e06c75;">{"h2 "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"uk-modal-title"</span><span>&gt;Modal Dialog&lt;/</span><span style="color:#e06c75;">h2</span><span>{">\n"}</span><span>{"\t\t<"}</span><span style="color:#e06c75;">p</span><span>&gt;This modal dialog was loaded dynamically by HTMX.&lt;/</span><span style="color:#e06c75;">p</span><span>{">\n"}</span><span>{"\n"}</span><span>{"\t\t<"}</span><span style="color:#e06c75;">{"form "}</span><span style="color:#d19a66;">_</span><span>=</span><span style="color:#98c379;">"on submit take .uk-open from #modal"</span><span>{">\n"}</span><span>{"\t\t\t<"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"uk-margin"</span><span>{">\n"}</span><span>{"\t\t\t\t<"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"uk-input\" "}</span><span style="color:#d19a66;">placeholder</span><span>=</span><span style="color:#98c379;">"What is Your Name?"</span><span>{">\n"}</span><span>{"\t\t\t</"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"\t\t\t<"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"button\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"uk-button uk-button-primary"</span><span>&gt;Save Changes&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"\t\t\t<"}</span><span style="color:#e06c75;">{"button \n"}</span><span>{"\t\t\t\t"}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"cancelButton\"\n"}</span><span>{"\t\t\t\t"}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"button\" \n"}</span><span>{"\t\t\t\t"}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"uk-button uk-button-default\" \n"}</span><span>{"\t\t\t\t"}</span><span style="color:#d19a66;">_</span><span>=</span><span style="color:#98c379;">"on click take .uk-open from #modal wait 200ms then remove #modal"</span><span>&gt;Close&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"\t\t</"}</span><span style="color:#e06c75;">form</span><span>{">\n"}</span><span>{"\t</"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>Hyperscript on the button and the form trigger animations when this dialog is completed or canceled. If you didn’t use this Hyperscript, the modals will still work but UIKit’s fade in animations will not be triggered.</p>
			{" "}
			<p>You can, of course, use JavaScript rather than Hyperscript for this work, it’s just a lot more code:</p>
			{" "}
			<pre data-lang="javascript" style="background-color:#1f2329;color:#abb2bf;" class="language-javascript "><code class="language-javascript" data-lang="javascript"><span>{"\n"}</span><span style="font-style:italic;color:#848da1;">{"// This triggers the fade-in animation when a modal dialog is loaded and displayed\n"}</span><span>window.</span><span style="color:#e06c75;">document</span><span>.</span><span style="color:#56b6c2;">getElementById</span><span>(</span><span style="color:#98c379;">"showButton"</span><span>).</span><span style="color:#56b6c2;">addEventListener</span><span>(</span><span style="color:#98c379;">"htmx:afterOnLoad"</span><span>{", "}</span><span style="color:#c678dd;">function</span><span>{"() {\n"}</span><span>{"\t"}</span><span style="color:#56b6c2;">setTimeout</span><span>(</span><span style="color:#c678dd;">function</span><span>{"(){\n"}</span><span>{"\t\twindow."}</span><span style="color:#e06c75;">document</span><span>.</span><span style="color:#56b6c2;">getElementById</span><span>(</span><span style="color:#98c379;">"modal"</span><span>).</span><span style="color:#e06c75;">classList</span><span>.</span><span style="color:#56b6c2;">add</span><span>(</span><span style="color:#98c379;">"uk-open"</span><span>{")\n"}</span><span>{"\t}, "}</span><span style="color:#d19a66;">10</span><span>{")\n"}</span><span>{"})\n"}</span><span>{"\n"}</span><span>{"\n"}</span><span style="font-style:italic;color:#848da1;">{"// This triggers the fade-out animation when the modal is closed.\n"}</span><span>window.</span><span style="color:#e06c75;">document</span><span>.</span><span style="color:#56b6c2;">getElementById</span><span>(</span><span style="color:#98c379;">"cancelButton"</span><span>).</span><span style="color:#56b6c2;">addEventListener</span><span>(</span><span style="color:#98c379;">"click"</span><span>{", "}</span><span style="color:#c678dd;">function</span><span>{"() {\n"}</span><span>{"\twindow."}</span><span style="color:#e06c75;">document</span><span>.</span><span style="color:#56b6c2;">getElementById</span><span>(</span><span style="color:#98c379;">"modal"</span><span>).</span><span style="color:#e06c75;">classList</span><span>.</span><span style="color:#56b6c2;">remove</span><span>(</span><span style="color:#98c379;">"uk-open"</span><span>{")\n"}</span><span>{"\t"}</span><span style="color:#56b6c2;">setTimeout</span><span>(</span><span style="color:#c678dd;">function</span><span>{"(){\n"}</span><span>{"\t\twindow."}</span><span style="color:#e06c75;">document</span><span>.</span><span style="color:#56b6c2;">getElementById</span><span>(</span><span style="color:#98c379;">"modals-here"</span><span>).</span><span style="color:#e06c75;">{"innerHTML "}</span><span>{"= "}</span><span style="color:#98c379;">{"\"\"\n"}</span><span>{"\t\t,"}</span><span style="color:#d19a66;">{"200\n"}</span><span>{"\t})\n"}</span><span>{"})\n"}</span></code></pre>
			{" "}
			<div el={target} id="modals-here"></div>
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
				    #modals-here's content (swapModal). */}
				{'\n'}
				<button
					class={loading ? 'uk-button uk-button-primary htmx-request' : 'uk-button uk-button-primary'}
					hx-get="/modal"
					hx-trigger="click"
					hx-target="#modals-here"
					_="on htmx:afterOnLoad wait 10ms then add .uk-open to #modal"
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
					Show Modal Dialog
				</button>
			</div>
			{" "}
			{" "}
		</main>
		<SiteFooter />
	</div>
}
