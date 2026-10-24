import { element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { runClassTools } from '../../../lib/class-tools.ts';

// Ported by hand from htmx.org's demo page (www/content/examples/animations.md): what htmx, class-tools and the page's
// sinon fake server did for each demo is Markless state here, with htmx's classes at htmx's times.
export default function Animations() @{
	let deleted = state(false);
	let fadeInButtons = state([0]);
	let submitted = state(false);
	let slid = state(false);
	const toggleDemo = element<HTMLElement>();
	const slideDemo = element<HTMLElement>();

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Animations</h1>
			{" "}
			{" "}
			{" "}
			<p>{"htmx is designed to allow you to use "}<a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Transitions/Using_CSS_transitions">CSS transitions</a>{" to add smooth animations and transitions to your web page using only CSS and HTML. Below are a few examples of various animation techniques."}</p>
			{" "}
			<p>{"htmx also allows you to use the new "}<a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API">View Transitions API</a>{" for creating animations."}</p>
			{" "}
			<h3 id="basic"><a class="zola-anchor" href="#basic" aria-label="Anchor link for: basic">Basic CSS Animations</a></h3>
			{" "}
			<h3 id="color-throb"><a class="zola-anchor" href="#color-throb" aria-label="Anchor link for: color-throb">Color Throb</a></h3>
			{" "}
			<p>{"The simplest animation technique in htmx is to keep the "}<code>id</code>{" of an element stable across a content swap. If the "}<code>id</code>{" of an element is kept stable, htmx will swap it in such a way that CSS transitions can be written between the old version of the element and the new one."}</p>
			{" "}
			<p>Consider this div:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span style="color:#d19a66;">{".smooth "}</span><span>{"{\n"}</span><span>{"  transition: all "}</span><span style="color:#d19a66;">{"1s "}</span><span>{"ease-in;\n"}</span><span>{"}\n"}</span><span>&lt;/</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"color-demo\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"smooth\" "}</span><span style="color:#d19a66;">style</span><span>=</span><span style="color:#98c379;">"</span><span>color:red</span><span style="color:#98c379;">{"\"\n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/colors\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"outerHTML\" "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">"every 1s"</span><span>{">\n"}</span><span>{"  Color Swap Demo\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"\n"}</span></code></pre>
			{" "}
			<p>{"This div will poll every second and will get replaced with new content which changes the "}<code>color</code>{" style to a new value (e.g. "}<code>blue</code>):</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"color-demo\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"smooth\" "}</span><span style="color:#d19a66;">style</span><span>=</span><span style="color:#98c379;">"</span><span>color:blue</span><span style="color:#98c379;">{"\"\n"}</span><span>{"      "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/colors\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"outerHTML\" "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">"every 1s"</span><span>{">\n"}</span><span>{"  Color Swap Demo\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"Because the div has a stable id, "}<code>color-demo</code>{", htmx will structure the swap such that a CSS transition, defined on the "}<code>.smooth</code>{" class, applies to the style update from "}<code>red</code>{" to "}<code>blue</code>, and smoothly transitions between them.</p>
			{" "}
			<h4 id="throb-demo"><a class="zola-anchor" href="#throb-demo" aria-label="Anchor link for: throb-demo">Demo</a></h4>
			{" "}
			{" "}
			{/* hx-get="/colors" hx-swap="outerHTML" hx-trigger="every 1s": a second after it is processed htmx asks for the div (it
			    carries htmx-request), the fake server answers after 80 ms, and htmx puts the answer in its place: a new div with the
			    old one's class and style plus htmx-added, given its own 20 ms later so .smooth's transition runs. As htmx's
			    processPolling does, each element's 1 s timeout re-arms itself while the element is in the page, and the new div
			    starts its own. */}
			<div
				id="color-demo"
				class="smooth"
				style="color:red"
				hx-get="/colors"
				hx-swap="outerHTML"
				hx-trigger="every 1s"
				onIdle={() => {
					const colors = ['blue', 'green', 'orange', 'red'];
					const request = (old: HTMLElement) => {
						old.classList.add('htmx-request');
						setTimeout(() => {
							if (!old.isConnected) return;
							const color = colors.shift()!;
							colors.push(color);
							const answer = document.createElement('template');
							answer.innerHTML = `<div id="color-demo" hx-get="/colors" hx-swap="outerHTML" class="smooth" hx-trigger="every 1s" style="color:${color}">\n  Color Swap Demo\n</div>\n`;
							const fresh = answer.content.firstElementChild as HTMLElement;
							const settled = { className: fresh.className, style: fresh.getAttribute('style') ?? '' };
							fresh.className = old.className;
							fresh.setAttribute('style', old.getAttribute('style') ?? '');
							fresh.classList.add('htmx-added');
							old.replaceWith(answer.content);
							poll(fresh);
							setTimeout(() => {
								fresh.className = settled.className;
								fresh.setAttribute('style', settled.style);
							}, 20);
						}, 80);
					};
					const poll = (elt: HTMLElement): void => {
						setTimeout(() => {
							if (!elt.isConnected) return;
							request(elt);
							poll(elt);
						}, 1000);
					};
					const first = document.getElementById('color-demo');
					if (first) poll(first);
				}}
			>
				{" Color Swap Demo "}
			</div>
			{" "}
			{" "}
			<h3 id="smooth-progress-bar"><a class="zola-anchor" href="#smooth-progress-bar" aria-label="Anchor link for: smooth-progress-bar">Smooth Progress Bar</a></h3>
			{" "}
			<p>{"The "}<a href="/examples/progress-bar/">Progress Bar</a>{" demo uses this basic CSS animation technique as well, by updating the "}<code>length</code>{" property of a progress bar element, allowing for a smooth animation."}</p>
			{" "}
			<h2 id="swapping"><a class="zola-anchor" href="#swapping" aria-label="Anchor link for: swapping">Swap Transitions</a></h2>
			{" "}
			<h3 id="fade-out-on-swap"><a class="zola-anchor" href="#fade-out-on-swap" aria-label="Anchor link for: fade-out-on-swap">Fade Out On Swap</a></h3>
			{" "}
			<p>{"If you want to fade out an element that is going to be removed when the request ends, you want to take advantage of the "}<code>htmx-swapping</code>{" class with some CSS and extend the swap phase to be long enough for your animation to complete. This can be done like so:"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span style="color:#d19a66;">{".fade-me-out.htmx-swapping "}</span><span>{"{\n"}</span><span>{"  opacity: "}</span><span style="color:#d19a66;">0</span><span>{";\n"}</span><span>{"  transition: opacity "}</span><span style="color:#d19a66;">{"1s "}</span><span>{"ease-out;\n"}</span><span>{"}\n"}</span><span>&lt;/</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"fade-me-out\"\n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-delete</span><span>=</span><span style="color:#98c379;">{"\"/fade_out_demo\"\n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML swap:1s"</span><span>{">\n"}</span><span>{"        Fade Me Out\n"}</span><span>&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span></code></pre>
			{" "}
			<h4 id="fade-swap-demo"><a class="zola-anchor" href="#fade-swap-demo" aria-label="Anchor link for: fade-swap-demo">Demo</a></h4>
			{" "}
			{" "}
			{/* hx-delete="/fade_out_demo" hx-swap="outerHTML swap:1s": the empty answer comes after 80 ms, the button carries
			    htmx-swapping for the second the swap waits, then goes. */}
			<p>
				@if (!deleted) {
					<button
						class="fade-me-out"
						hx-delete="/fade_out_demo"
						hx-swap="outerHTML swap:1s"
						onClick={(event) => {
							const button = (event.target as Element).closest('button');
							if (!button || button.className !== 'fade-me-out') return;
							button.classList.add('htmx-request');
							setTimeout(() => {
								button.classList.replace('htmx-request', 'htmx-swapping');
								setTimeout(() => (deleted = true), 1000);
							}, 80);
						}}
					>
						{" Delete Me "}
					</button>
				}
			</p>
			{" "}
			{" "}
			<h2 id="settling"><a class="zola-anchor" href="#settling" aria-label="Anchor link for: settling">Settling Transitions</a></h2>
			{" "}
			<h3 id="fade-in-on-addition"><a class="zola-anchor" href="#fade-in-on-addition" aria-label="Anchor link for: fade-in-on-addition">Fade In On Addition</a></h3>
			{" "}
			<p>{"Building on the last example, we can fade in the new content by using the "}<code>htmx-added</code>{" class during the settle phase. You can also write CSS transitions against the target, rather than the new content, by using the "}<code>htmx-settling</code>{" class."}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span style="color:#d19a66;">{"#fade-me-in.htmx-added "}</span><span>{"{\n"}</span><span>{"  opacity: "}</span><span style="color:#d19a66;">0</span><span>{";\n"}</span><span>{"}\n"}</span><span style="color:#d19a66;">{"#fade-me-in "}</span><span>{"{\n"}</span><span>{"  opacity: "}</span><span style="color:#d19a66;">1</span><span>{";\n"}</span><span>{"  transition: opacity "}</span><span style="color:#d19a66;">{"1s "}</span><span>{"ease-out;\n"}</span><span>{"}\n"}</span><span>&lt;/</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"fade-me-in\"\n"}</span><span>{"        "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn primary\"\n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/fade_in_demo\"\n"}</span><span>{"        "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML settle:1s"</span><span>{">\n"}</span><span>{"        Fade Me In\n"}</span><span>&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span></code></pre>
			{" "}
			<h4 id="fade-settle-demo"><a class="zola-anchor" href="#fade-settle-demo" aria-label="Anchor link for: fade-settle-demo">Demo</a></h4>
			{" "}
			{" "}
			{/* hx-post="/fade_me_in" hx-swap="outerHTML settle:1s": after 80 ms a new button takes the old one's place with its class
			    and htmx-added (so it starts at opacity 0), and gets its own class a second later, when #fade-me-in's transition runs. */}
			<p>
				@for (const n of fadeInButtons; key n) {
					<button
						id="fade-me-in"
						class={n === 0 ? 'btn primary' : 'btn primary htmx-request htmx-added'}
						hx-post="/fade_me_in"
						hx-swap="outerHTML settle:1s"
						onClick={(event) => {
							const button = (event.target as Element).closest('button');
							if (!button || button.className !== 'btn primary') return;
							button.classList.add('htmx-request');
							setTimeout(() => {
								const focused = document.activeElement === button;
								const next = fadeInButtons[0]! + 1;
								fadeInButtons = [next];
								// htmx gives the focus to the element of the same id in the new content.
								const refocus = () => {
									const fresh = document.getElementById('fade-me-in');
									if (fresh && fresh !== button) fresh.focus({ preventScroll: true });
									else requestAnimationFrame(refocus);
								};
								if (focused) refocus();
								setTimeout(() => {
									const fresh = document.getElementById('fade-me-in');
									if (fresh) fresh.className = 'btn primary';
								}, 1000);
							}, 80);
						}}
					>
						{" Fade Me In "}
					</button>
				}
			</p>
			{" "}
			{" "}
			<h2 id="request"><a class="zola-anchor" href="#request" aria-label="Anchor link for: request">Request In Flight Animation</a></h2>
			{" "}
			<p>{"You can also take advantage of the "}<code>htmx-request</code>{" class, which is applied to the element that triggers a request. Below is a form that on submit will change its look to indicate that a request is being processed:"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>{"  "}</span><span style="color:#e06c75;">form</span><span style="color:#d19a66;">{".htmx-request "}</span><span>{"{\n"}</span><span>{"    opacity: "}</span><span style="color:#d19a66;">.5</span><span>{";\n"}</span><span>{"    transition: opacity "}</span><span style="color:#d19a66;">{"300ms "}</span><span>{"linear;\n"}</span><span>{"  }\n"}</span><span>&lt;/</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"form "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/name\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">label</span><span>&gt;Name:&lt;/</span><span style="color:#e06c75;">label</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"name"</span><span>&gt;&lt;</span><span style="color:#e06c75;">br</span><span>{"/>\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn primary"</span><span>&gt;Submit&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">form</span><span>{">\n"}</span></code></pre>
			{" "}
			<h4 id="request-demo"><a class="zola-anchor" href="#request-demo" aria-label="Anchor link for: request-demo">Demo</a></h4>
			{" "}
			{" "}
			{/* hx-post="/name" hx-swap="outerHTML": the form carries htmx-request until the answer, 80 ms later, replaces it. The
			    submit is handled on this div, outside the branch, so the page prevents the native submit before any code loads. */}
			<div
				aria-live="polite"
				onSubmit={(event) => {
					event.preventDefault();
					const form = event.target as HTMLFormElement;
					if (form.classList.contains('htmx-request')) return;
					form.classList.add('htmx-request');
					setTimeout(() => (submitted = true), 80);
				}}
			>
				{" "}
				@if (!submitted) {
					<form
						hx-post="/name"
						hx-swap="outerHTML"
					>
						{" "}
						<label>Name:</label>
						<input name="name" />
						<br />
						{" "}
						<button class="btn primary">Submit</button>
						{" "}
					</form>
				} @else {
					<>Submitted!</>
				}
				{" "}
			</div>
			{" "}
			{" "}
			<h2 id="using-the-htmx-class-tools-extension"><a class="zola-anchor" href="#using-the-htmx-class-tools-extension" aria-label="Anchor link for: using-the-htmx-class-tools-extension">{"Using the htmx "}<code>class-tools</code>{" Extension"}</a></h2>
			{" "}
			<p>{"Many interesting animations can be created by using the "}<a rel="noopener" target="_blank" href="https://github.com/bigskysoftware/htmx-extensions/blob/main/src/class-tools/README.md"><code>class-tools</code></a>{" extension."}</p>
			{" "}
			<p>Here is an example that toggles the opacity of a div. Note that we set the toggle time to be a bit longer than the transition time. This avoids flickering that can happen if the transition is interrupted by a class change.</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span style="color:#d19a66;">{".demo.faded "}</span><span>{"{\n"}</span><span>{"  opacity:"}</span><span style="color:#d19a66;">.3</span><span>{";\n"}</span><span>{"}\n"}</span><span style="color:#d19a66;">{".demo "}</span><span>{"{\n"}</span><span>{"  opacity:"}</span><span style="color:#d19a66;">1</span><span>{";\n"}</span><span>{"  transition: opacity ease-in "}</span><span style="color:#d19a66;">900ms</span><span>{";\n"}</span><span>{"}\n"}</span><span>&lt;/</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"demo\" "}</span><span style="color:#d19a66;">classes</span><span>=</span><span style="color:#98c379;">"toggle faded:1s"</span><span>&gt;Toggle Demo&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<h4 id="class-tools-demo"><a class="zola-anchor" href="#class-tools-demo" aria-label="Anchor link for: class-tools-demo">Demo</a></h4>
			{" "}
			{" "}
			<div class="demo" classes="toggle faded:1s" el={toggleDemo} onIdle={() => runClassTools(toggleDemo)}>Toggle Demo</div>
			{" "}
			<h3 id="view-transitions"><a class="zola-anchor" href="#view-transitions" aria-label="Anchor link for: view-transitions">Using the View Transition API</a></h3>
			{" "}
			<p>{"htmx provides access to the new "}<a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API">View Transitions API</a>{" via the "}<code>transition</code>{" option of the "}<a href="/attributes/hx-swap"><code>hx-swap</code></a>{" attribute."}</p>
			{" "}
			<p>{"Below is an example of a swap that uses a view transition. The transition is tied to the outer div via a "}<code>view-transition-name</code>{" property in CSS, and that transition is defined in terms of "}<code>::view-transition-old</code>{" and "}<code>::view-transition-new</code>{", using "}<code>&#64;keyframes</code>{" to define the animation. (Fuller details on the View Transition API can be found on the "}<a rel="noopener" target="_blank" href="https://developer.chrome.com/docs/web-platform/view-transitions/">Chrome Developer Page</a>{" on them.)"}</p>
			{" "}
			<p>The old content of this transition should slide out to the left and the new content should slide in from the right.</p>
			{" "}
			<p>Note that, as of this writing, the visual transition will only occur on Chrome 111+, but more browsers are expected to implement this feature in the near future.</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>{"   "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"fade-in {\n"}</span><span>{"     "}</span><span style="color:#c678dd;">{"from "}</span><span>{"{ opacity: "}</span><span style="color:#d19a66;">0</span><span>{"; }\n"}</span><span>{"   }\n"}</span><span>{"\n"}</span><span>{"   "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"fade-out {\n"}</span><span>{"     "}</span><span style="color:#c678dd;">{"to "}</span><span>{"{ opacity: "}</span><span style="color:#d19a66;">0</span><span>{"; }\n"}</span><span>{"   }\n"}</span><span>{"\n"}</span><span>{"   "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"slide-from-right {\n"}</span><span>{"     "}</span><span style="color:#c678dd;">{"from "}</span><span>{"{ transform: "}</span><span style="color:#56b6c2;">translateX</span><span>(</span><span style="color:#d19a66;">90px</span><span>{"); }\n"}</span><span>{"   }\n"}</span><span>{"\n"}</span><span>{"   "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"slide-to-left {\n"}</span><span>{"     "}</span><span style="color:#c678dd;">{"to "}</span><span>{"{ transform: "}</span><span style="color:#56b6c2;">translateX</span><span>(</span><span style="color:#d19a66;">-90px</span><span>{"); }\n"}</span><span>{"   }\n"}</span><span>{"\n"}</span><span>{"   "}</span><span style="color:#d19a66;">{".slide-it "}</span><span>{"{\n"}</span><span>{"     view-transition-name: slide-it;\n"}</span><span>{"   }\n"}</span><span>{"\n"}</span><span>{"   "}</span><span style="color:#d19a66;">::</span><span style="color:#c678dd;">view-transition-old(</span><span style="color:#e06c75;">slide-it</span><span>{") {\n"}</span><span>{"     animation: "}</span><span style="color:#d19a66;">{"180ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0.4</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") both fade-out,\n"}</span><span>{"     "}</span><span style="color:#d19a66;">{"600ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0.4</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0.2</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") both slide-to-left;\n"}</span><span>{"   }\n"}</span><span>{"   "}</span><span style="color:#d19a66;">::</span><span style="color:#c678dd;">view-transition-new(</span><span style="color:#e06c75;">slide-it</span><span>{") {\n"}</span><span>{"     animation: "}</span><span style="color:#d19a66;">{"420ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0.2</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") "}</span><span style="color:#d19a66;">{"90ms "}</span><span>{"both fade-in,\n"}</span><span>{"     "}</span><span style="color:#d19a66;">{"600ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0.4</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0.2</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") both slide-from-right;\n"}</span><span>{"   }\n"}</span><span>&lt;/</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>{"\n"}</span><span>{"\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"slide-it"</span><span>{">\n"}</span><span>{"   <"}</span><span style="color:#e06c75;">h1</span><span>&gt;Initial Content&lt;/</span><span style="color:#e06c75;">h1</span><span>{">\n"}</span><span>{"   <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn primary\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/new-content\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"innerHTML transition:true\" "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"closest div"</span><span>{">\n"}</span><span>{"     Swap It!\n"}</span><span>{"   </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<h4 id="demo"><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">Demo</a></h4>
			{" "}
			{" "}
			{/* hx-get with hx-swap="innerHTML transition:true" hx-target="closest div": the answer comes after 80 ms and htmx swaps the
			    div's content inside a view transition (the old content slides out, the new slides in). htmx binds the button's click
			    when it processes the page and adds htmx-request in the click itself, so the listener is bound here when the page is
			    idle, on the div, for the button of either content. */}
			<div
				class="slide-it"
				el={slideDemo}
				onIdle={() =>
					slideDemo?.addEventListener('click', (event) => {
						const button = (event.target as Element).closest('button');
						if (!button || button.classList.contains('htmx-request')) return;
						button.classList.add('htmx-request');
						setTimeout(() => {
							const swap = () => {
								slid = !slid;
								// Rendering waits for the promise, so the new content is in place for the transition's second picture.
								return new Promise<void>((resolve) => setTimeout(resolve));
							};
							if (document.startViewTransition) document.startViewTransition(swap);
							else swap();
						}, 80);
					})
				}
			>
				{" "}
				@if (!slid) {
					<>
						<h1>Initial Content</h1>
						{" "}
						<button class="btn primary" hx-get="/new-content" hx-swap="innerHTML transition:true" hx-target="closest div">
							{" Swap It! "}
						</button>
					</>
				} @else {
					<>
						<h1>New Content</h1>
						{" "}
						<button class="btn danger" hx-get="/original-content" hx-swap="innerHTML transition:true" hx-target="closest div">
							{"Restore It! "}
						</button>
					</>
				}
				{" "}
			</div>
			{" "}
			{" "}
			<h2 id="conclusion"><a class="zola-anchor" href="#conclusion" aria-label="Anchor link for: conclusion">Conclusion</a></h2>
			{" "}
			<p>You can use the techniques above to create quite a few interesting and pleasing effects with plain old HTML while using htmx.</p>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
