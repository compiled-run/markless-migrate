// Ported by hand from htmx.org's move-before example (the importer writes its head): htmx's boosted "View Details" link
// and the hx-preserve video run in components/move-before.ts.
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { boost } from '../../../components/move-before.ts';

export default function Page() @{
	<div style="display: contents">
		<SiteHeader />
		<main class="c content ">
			<h1>Experimental moveBefore() Support</h1>
			{" "}
			<p>{"This page demonstrates the use of the experimental "}<a rel="noopener" target="_blank" href="https://github.com/whatwg/dom/issues/1255"><code>moveBefore()</code></a>{" DOM API available in "}<a rel="noopener" target="_blank" href="https://www.google.com/chrome/canary/">Chrome Canary</a>{", which has been integrated into the "}<code>hx-preserve</code>{" attribute of htmx, if it is available."}</p>
			{" "}
			<h3 id="getting-chrome-canary-enabling-movebefore"><a class="zola-anchor" href="#getting-chrome-canary-enabling-movebefore" aria-label="Anchor link for: getting-chrome-canary-enabling-movebefore">{"Getting Chrome Canary & Enabling "}<code>moveBefore()</code></a></h3>
			{" "}
			<p>For the demo to work properly you will need to install Chrome Canary and enable the API:</p>
			{" "}
			<ul>{" "}<li>{"Navigate to "}<a href="chrome://flags/#atomic-move">{"chrome://flags/#atomic-move"}</a></li>{" "}<li>Enable “Atomic DOM move”</li>{" "}</ul>
			{" "}
			<p>{"htmx takes advantage of this API in the "}<code>hx-preserve</code>{" functionality if it is available, allowing you to mark an element as “preserved” and having all its state preserved as it moves between areas on the screen when new content is merged in. This is significantly better developer experience than current alternatives, such as morphing, which rely on the structure of the new page being “close enough” to not have to move things like video elements."}</p>
			{" "}
			<h3 id="demo"><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">Demo</a></h3>
			{" "}
			<p>{"If you inspect the video below you will see that it is embedded in a "}<code>div</code>{" element. If you click the “View Details” link, which is boosted, you will transition to another page with a video element with the same id, but embedded in a "}<code>figure</code>{" element instead. Without the "}<code>moveBefore()</code>{" functionality it is impossible to keep the video playing in this situation because “reparenting” (i.e. changing the parent of an element) causes it to reset."}</p>
			{" "}
			<p><code>moveBefore()</code>{" opens up a huge number of possibilities in web development by allowing developers to completely change the layout of a page while still preserving elements play state, focus, etc."}</p>
			{" "}
			<div class="center">{" "}<iframe hx-preserve="true" id="rick-roll" width="617" height="351" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Rick Astley - Never Gonna Give You Up (Official Music Video)" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>{" "}<div>{" "}<a
					hx-boost="true"
					href="/examples/move-before/details"
					onClick={(event) => {
						if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
						event.preventDefault();
						boost('/examples/move-before/details');
					}}
				>
					View Details →
				</a>{" "}</div>{" "}</div>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
