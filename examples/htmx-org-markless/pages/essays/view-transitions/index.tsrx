import { state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';

// Ported by hand from htmx.org's source (scripts/import-htmx-org.ts writes its head): the demo's hx-get, answered by
// demo.js's sinon fake server after 80 ms and swapped inside a view transition, is Markless state here.
export default function Page() @{
	let swapped = state(false);

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>View Transitions</h1>
			{" "}
			<p>We have asserted, for a while now, that a major reason that many people have adopted the SPA architecture for web applications is due to aesthetic considerations.</p>
			{" "}
			<p>{"As we mention in our book "}<a rel="noopener" target="_blank" href="https://hypermedia.systems">Hypermedia Systems</a>{", when discussing the Web 1.0-style contact management application we begin with, there are serious "}<em>aesthetic</em>{" issues with the application, even if it has feature-parity with an SPA version:"}</p>
			{" "}
			<blockquote>{" "}<p>From a user experience perspective: there is a noticeable refresh when you move between pages of the application, or when you create, update or delete a contact. This is because every user interaction (link click or form submission) requires a full page refresh, with a whole new HTML document to process after each action.</p>{" "}<p><em>{"–Hypermedia Systems - "}<a rel="noopener" target="_blank" href="https://hypermedia.systems/extending-html-as-hypermedia/">Chapter 4</a></em></p>{" "}</blockquote>
			{" "}
			<p>{"This jarring “ka-chunk” between webpages, often with a "}<a rel="noopener" target="_blank" href="https://webkit.org/blog/66/the-fouc-problem/">Flash of Unstyled Content</a>{" has been with us forever and, while modern browsers have improved the situation somewhat (while, unfortunately, also making it less obvious that a request is in flight) the situation is still bad, particularly when compared with what a well-crafted SPA can achieve."}</p>
			{" "}
			<p>{"Now, early on in the life of the web, this wasn’t such a big deal. We had stars flying around dinosaurs "}<em>in the browser’s toolbar</em>, flaming text, table-based layouts, dancing babies and so forth, and we were largely comparing the web with things like ftp clients.</p>
			{" "}
			<p>{"The bar was "}<em>low</em>{" and the times were "}<em>good</em>.</p>
			{" "}
			<p>{"Alas, the web has since put away such childish things, and now we are expected to present polished, attractive interfaces to our users, "}<em>including</em>{" smooth transitions from one view state to another."}</p>
			{" "}
			<p>Again, we feel this is why many teams default to the SPA approach: the old way just seems… clunky.</p>
			{" "}
			<h2 id="css-transitions"><a class="zola-anchor" href="#css-transitions" aria-label="Anchor link for: css-transitions">CSS Transitions</a></h2>
			{" "}
			<p>{"The early web engineers realized that web developers would like to provide smooth transitions between different view states and have offered various technologies for achieving this. A major one is "}<a rel="noopener" target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/CSS/transition">CSS Transitions</a>{", which allow you to specify a mathematical "}<em>transition</em>{" from one state to another."}</p>
			{" "}
			<p>{"Unfortunately for HTML, CSS transitions are only available if you use JavaScript: you have to change elements dynamically in order to trigger the transitions, which “vanilla” HTML can’t do. In practice, this meant that only the cool kids using JavaScript to build SPAs got to use these tools, further cementing the "}<em>aesthetic superiority</em>{" of SPAs."}</p>
			{" "}
			<p>{"htmx, as you probably know, makes CSS Transitions "}<a rel="noopener" target="_blank" href="/examples/animations/">available in plain HTML</a>{" via a somewhat elaborate "}<a rel="noopener" target="_blank" href="/docs/#request-operations">swapping model</a>{" where we take elements that are in both the old and new content and “settle” attributes on them. It’s a neat trick and can be used to make hypermedia-driven application feel as buttery-smooth as well done SPA."}</p>
			{" "}
			<p>{"However, there is a new kid on the block: "}<a rel="noopener" target="_blank" href="https://developer.chrome.com/docs/web-platform/view-transitions/">The View Transition API</a></p>
			{" "}
			<h2 id="the-view-transition-api"><a class="zola-anchor" href="#the-view-transition-api" aria-label="Anchor link for: the-view-transition-api">The View Transition API</a></h2>
			{" "}
			<p>{"The View Transition API is much more ambitious than CSS transitions in that it is attempting to provide a simple, intuitive API for transitioning an "}<em>entire DOM</em>{" from one state to another in a way that mere mortals can take advantage of."}</p>
			{" "}
			<p>{"Furthermore, this API is supposed to be available not only in JavaScript, but also for plain old links and forms in HTML as well, making it possible to build "}<em>much nicer</em>{" user interfaces using the Web 1.0 approach."}</p>
			{" "}
			<p>It will be fun to revisit the Contact application in “Hypermedia Systems” when this functionality is available!</p>
			{" "}
			<p>As of this writing, however, the API is, like CSS Transitions, only available in JavaScript, and its only been just released in Chrome 111+.</p>
			{" "}
			<p>In JavaScript, The API could not be more simple:</p>
			{" "}
			<pre data-lang="js" style="background-color:#1f2329;color:#abb2bf;" class="language-js "><code class="language-js" data-lang="js"><span>{"\n"}</span><span>{"  "}</span><span style="font-style:italic;color:#848da1;">{"// this is all it takes to get a smooth transition from one \n"}</span><span>{"  "}</span><span style="font-style:italic;color:#848da1;">{"// state to another!\n"}</span><span>{"  document."}</span><span style="color:#61afef;">startViewTransition</span><span>{"(() "}</span><span style="color:#c678dd;">{"=> "}</span><span style="color:#61afef;">updateTheDOMSomehow</span><span>(</span><span style="color:#e06c75;">data</span><span>{"));\n"}</span><span>{"\n"}</span></code></pre>
			{" "}
			<p>Now, that’s my kind of API.</p>
			{" "}
			<p>As luck would have it, it’s trivial to wrap this API around the regular htmx swapping model, which allows us to start exploring View Transitions in htmx, even before it’s generally available in HTML!</p>
			{" "}
			<p>{"And, as of "}<a rel="noopener" target="_blank" href={"https://cdn.jsdelivr.net/npm/htmx.org@1.9.0"}>htmx 1.9.0</a>{", you can start experimenting with the API by adding the "}<code>transition:true</code>{" attribute to an "}<a href="/attributes/hx-swap"><code>hx-swap</code></a>{" attribute."}</p>
			{" "}
			<h2 id="a-practical-example"><a class="zola-anchor" href="#a-practical-example" aria-label="Anchor link for: a-practical-example">A Practical Example</a></h2>
			{" "}
			<p>So let’s look at a simple example of this new shiny toy coupled with htmx.</p>
			{" "}
			<p>Doing so will involve two parts:</p>
			{" "}
			<ul>{" "}<li>Defining our View Transition animation via CSS</li>{" "}<li>Adding a small annotation to an htmx-powered button</li>{" "}</ul>
			{" "}
			<h3 id="the-css"><a class="zola-anchor" href="#the-css" aria-label="Anchor link for: the-css">The CSS</a></h3>
			{" "}
			<p>The first thing that we need to do is define the View Transition animation that we want.</p>
			{" "}
			<ul>{" "}<li>Define some animations using &#64;keyframes to slide and fade content</li>{" "}<li>{"Define a view transition with the name "}<code>slide-it</code>{" using the "}<code>:view-transition-old()</code>{" and "}<code>:view-transition-new()</code>{" pseudo-selectors"}</li>{" "}<li>{"Tie the "}<code>.sample-transition</code>{" class to the "}<code>slide-it</code>{" view transition that we just defined, so we can bind it to elements via a that CSS class name"}</li>{" "}</ul>
			{" "}
			<p>{"(Fuller details on the View Transition API can be found on the "}<a rel="noopener" target="_blank" href="https://developer.chrome.com/docs/web-platform/view-transitions/">Chrome Developer Page</a>{" documenting them.)"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>{"\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>{"       "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"fade-in {\n"}</span><span>{"         "}</span><span style="color:#c678dd;">{"from "}</span><span>{"{ opacity: "}</span><span style="color:#d19a66;">0</span><span>{"; }\n"}</span><span>{"       }\n"}</span><span>{"    \n"}</span><span>{"       "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"fade-out {\n"}</span><span>{"         "}</span><span style="color:#c678dd;">{"to "}</span><span>{"{ opacity: "}</span><span style="color:#d19a66;">0</span><span>{"; }\n"}</span><span>{"       }\n"}</span><span>{"    \n"}</span><span>{"       "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"slide-from-right {\n"}</span><span>{"         "}</span><span style="color:#c678dd;">{"from "}</span><span>{"{ transform: "}</span><span style="color:#56b6c2;">translateX</span><span>(</span><span style="color:#d19a66;">90px</span><span>{"); }\n"}</span><span>{"       }\n"}</span><span>{"    \n"}</span><span>{"       "}</span><span style="color:#c678dd;">{"@keyframes "}</span><span>{"slide-to-left {\n"}</span><span>{"         "}</span><span style="color:#c678dd;">{"to "}</span><span>{"{ transform: "}</span><span style="color:#56b6c2;">translateX</span><span>(</span><span style="color:#d19a66;">-90px</span><span>{"); }\n"}</span><span>{"       }\n"}</span><span>{"    \n"}</span><span>{"       "}</span><span style="font-style:italic;color:#848da1;">{"/* define animations for the old and new content */\n"}</span><span>{"       "}</span><span style="color:#d19a66;">::</span><span style="color:#c678dd;">view-transition-old(</span><span style="color:#e06c75;">slide-it</span><span>{") {\n"}</span><span>{"         animation: "}</span><span style="color:#d19a66;">{"180ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0.4</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") both fade-out,\n"}</span><span>{"         "}</span><span style="color:#d19a66;">{"600ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0.4</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0.2</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") both slide-to-left;\n"}</span><span>{"       }\n"}</span><span>{"       "}</span><span style="color:#d19a66;">::</span><span style="color:#c678dd;">view-transition-new(</span><span style="color:#e06c75;">slide-it</span><span>{") {\n"}</span><span>{"         animation: "}</span><span style="color:#d19a66;">{"420ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0.2</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") "}</span><span style="color:#d19a66;">{"90ms "}</span><span>{"both fade-in,\n"}</span><span>{"         "}</span><span style="color:#d19a66;">{"600ms "}</span><span style="color:#56b6c2;">cubic-bezier</span><span>(</span><span style="color:#d19a66;">0.4</span><span>{", "}</span><span style="color:#d19a66;">0</span><span>{", "}</span><span style="color:#d19a66;">0.2</span><span>{", "}</span><span style="color:#d19a66;">1</span><span>{") both slide-from-right;\n"}</span><span>{"       }\n"}</span><span>{"    \n"}</span><span>{"       "}</span><span style="font-style:italic;color:#848da1;">{"/* tie the view transition to a given CSS class */\n"}</span><span>{"       "}</span><span style="color:#d19a66;">{".sample-transition "}</span><span>{"{\n"}</span><span>{"           view-transition-name: slide-it;\n"}</span><span>{"       }\n"}</span><span>{"        \n"}</span><span>{"    </"}</span><span style="color:#e06c75;">style</span><span>{">\n"}</span><span>{"\n"}</span></code></pre>
			{" "}
			<p>{"This CSS sets it up such that content with the "}<code>.sample-transition</code>{" class on it will fade out and slide to the left when it is removed, and new content will fade in and slide in from the right."}</p>
			{" "}
			<h3 id="the-html"><a class="zola-anchor" href="#the-html" aria-label="Anchor link for: the-html">The HTML</a></h3>
			{" "}
			<p>With our View Transition defined via CSS, the next thing to do is to tie this View Transition to an actual element that htmx will mutate, and to specify that htmx should take advantage of the View Transition API:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>{"\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"sample-transition"</span><span>{">\n"}</span><span>{"       <"}</span><span style="color:#e06c75;">h1</span><span>&gt;Initial Content&lt;/</span><span style="color:#e06c75;">h1</span><span>{">\n"}</span><span>{"       <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/new-content\" \n"}</span><span>{"               "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"innerHTML transition:true\" \n"}</span><span>{"               "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"closest div"</span><span>{">\n"}</span><span>{"         Swap It!\n"}</span><span>{"       </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"\n"}</span></code></pre>
			{" "}
			<p>{"Here we have a button that issues an "}<code>GET</code>{" to get some new content, and that replaces the closest div’s inner HTML with the response."}</p>
			{" "}
			<p>{"That div has the "}<code>sample-transition</code>{" class on it, so the View Transition defined above will apply to it."}</p>
			{" "}
			<p>{"Finally, the "}<code>hx-swap</code>{" attribute includes the option, "}<code>transition:true</code>, which is what tells htmx to use the internal View Transition JavaScript API when swapping.</p>
			{" "}
			<h2 id="demo"><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">Demo</a></h2>
			{" "}
			<p>With all that tied together, we are ready to start using the View Transition API with htmx. Here’s a demo, which should work in Chrome 111+ (other browsers will work fine, but won’t get the nice animation):</p>
			{" "}
			{" "}
			{/* hx-get with hx-swap="innerHTML transition:true" hx-target="closest div": the answer comes after 80 ms and htmx swaps the
			    div's content inside a view transition (the old content slides out, the new slides in). */}
			<div class="sample-transition" style="padding: 24px">
				@if (!swapped) {
					<>
						{" "}
						<h1>Initial Content</h1>
						{" "}
						<button
							hx-get="/new-content"
							hx-swap="innerHTML transition:true"
							hx-target="closest div"
							onClick={(event) => {
								const button = (event.target as Element).closest('button');
								if (!button || button.classList.contains('htmx-request')) return;
								button.classList.add('htmx-request');
								setTimeout(() => {
									const swap = () => {
										swapped = !swapped;
										// Rendering waits for the promise, so the new content is in place for the transition's second picture.
										return new Promise<void>((resolve) => setTimeout(resolve));
									};
									if (document.startViewTransition) document.startViewTransition(swap);
									else swap();
								}, 80);
							}}
						>
							{" Swap It! "}
						</button>
						{" "}
					</>
				} @else {
					<>
						<h1>New Content</h1>
						{" "}
						<button
							hx-get="/original-content"
							hx-swap="innerHTML transition:true"
							hx-target="closest div"
							onClick={(event) => {
								const button = (event.target as Element).closest('button');
								if (!button || button.classList.contains('htmx-request')) return;
								button.classList.add('htmx-request');
								setTimeout(() => {
									const swap = () => {
										swapped = !swapped;
										// Rendering waits for the promise, so the new content is in place for the transition's second picture.
										return new Promise<void>((resolve) => setTimeout(resolve));
									};
									if (document.startViewTransition) document.startViewTransition(swap);
									else swap();
								}, 80);
							}}
						>
							{"Restore It! "}
						</button>
					</>
				}
			</div>
			{" "}
			<p>Assuming you are looking at this page in Chrome 111+, you should see the content above slide gracefully out to the left and be replaced by new content sliding in from the right. Nice!</p>
			{" "}
			<h2 id="conclusion"><a class="zola-anchor" href="#conclusion" aria-label="Anchor link for: conclusion">Conclusion</a></h2>
			{" "}
			<p>Hey now, that’s pretty neat, and, once you get your head around the concept, not all that much work! This new API shows a lot of promise.</p>
			{" "}
			<p>{"View Transitions are an exciting new technology that we feel can dramatically level the playing field between "}<a rel="noopener" target="_blank" href="/essays/hypermedia-driven-applications/">Hypermedia Driven Applications</a>{" and the more prevalent SPA architecture used today."}</p>
			{" "}
			<p>{"By doing away with the ugly “ka-chunk” of Web 1.0 applications, the aesthetic advantages of the SPA approach will be diminished, and we can make decisions less around “sizzle” and focus more on the actual "}<a rel="noopener" target="_blank" href="/essays/when-to-use-hypermedia/">technical tradeoffs</a>{" associated with various architectures."}</p>
			{" "}
			<p>We are looking forward to when View Transitions are available in vanilla HTML, but, until then, you can start playing with them in htmx, today!</p>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
