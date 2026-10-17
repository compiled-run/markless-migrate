import type { PageProps } from '@markless/router';
import DocsHeader from '../components/docs-header.tsrx';
import DocsSidebar from '../components/docs-sidebar.tsrx';
import Sponsor from '../components/sponsor.tsrx';
import Toc from '../components/toc.tsrx';
import { CounterDemo, DropdownDemo, SearchDemo } from '../components/start-demos.tsrx';
import { START_HEADINGS, wake, watchHeadings as watch } from '../site.ts';

// An imported function inside attach is not carried into the compiled behaviour in Markless 0.4.0 ("is not defined"); a module-level one is.
function watchHeadings(main: HTMLElement): () => void {
	return watch(main);
}

export default function StartHere({ url }: PageProps) @{
	<div style="display: contents">
		<DocsHeader pathname={url.pathname} />
		<DocsSidebar pathname={url.pathname} />
		<main class="pt-32 pl-0 pr-0 md:pl-48 lg:pl-64 xl:pr-64" attach={(main) => watchHeadings(main)} onWheel={() => wake()} onTouchStart={() => wake()} onKeyDown={() => wake()}>
			<div class="m-auto max-w-3xl px-6 pb-24 text-gray-800 antialiased markdown" listen-for-intersection-of-titles="">
				<h1>Start Here</h1>
				<p>Create a blank HTML file somewhere on your computer with a name like: <code>i-love-alpine.html</code></p>
				<p>Using a text editor, fill the file with these contents:</p>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">html</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">head</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">script</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">defer</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">src</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"https://cdn.jsdelivr.net/npm/alpinejs&#64;3.x.x/dist/cdn.min.js"</span><span style="color: #24292E;">&gt;&lt;/</span><span style="color: #22863A;">script</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;/</span><span style="color: #22863A;">head</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">body</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">h1</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-data</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&#123; message: </span><span style="color: #032F62;">'I ❤️ Alpine'</span><span style="color: #24292E;"> &#125;</span><span style="color: #032F62;">"</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-text</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">message</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;&lt;/</span><span style="color: #22863A;">h1</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;/</span><span style="color: #22863A;">body</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;/</span><span style="color: #22863A;">html</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<html>\n<head>\n    <script defer src=\"https://cdn.jsdelivr.net/npm/"}alpinejs&#64;3.x.x{"/dist/cdn.min.js\"></script>\n</head>\n<body>\n    <h1 x-data=\"{ message: 'I ❤️ Alpine' }\" x-text=\"message\"></h1>\n</body>\n</html>"}</div></code></pre>
				<p>Open your file in a web browser, if you see <code>I ❤️ Alpine</code>, you're ready to rumble!</p>
				<p>Now that you're all set up to play around, let's look at three practical examples as a foundation for teaching you the basics of Alpine. By the end of this exercise, you should be more than equipped to start building stuff on your own. Let's goooooo.</p>
				<ul class="flex flex-col space-y-2 list-inside !list-decimal">
					<li>
						<a href="#building-a-counter">Building a counter</a>
					</li>
					<li>
						<a href="#building-a-dropdown">Building a dropdown</a>
					</li>
					<li>
						<a href="#building-a-search-input">Building a search Input</a>
					</li>
				</ul>
				<h2 id="building-a-counter">
					<a href="#building-a-counter">Building a counter</a>
				</h2>
				<p>Let's start with a simple "counter" component to demonstrate the basics of state and event listening in Alpine, two core features.</p>
				<p>Insert the following into the <code>&lt;body&gt;</code> tag:</p>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">div</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-data</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&#123; count: </span><span style="color: #005CC5;">0</span><span style="color: #24292E;"> &#125;</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">button</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-on</span><span style="color: #24292E;">:</span><span style="color: #6F42C1;">click</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">count</span><span style="color: #D73A49;">++</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;Increment&lt;/</span><span style="color: #22863A;">button</span><span style="color: #24292E;">&gt;</span></div><div class="line">{" "}</div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">span</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-text</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">count</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;&lt;/</span><span style="color: #22863A;">span</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;/</span><span style="color: #22863A;">div</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<div x-data=\"{ count: 0 }\">\n    <button x-on:click=\"count++\">Increment</button>\n\n    <span x-text=\"count\"></span>\n</div>"}</div></code></pre>
				<CounterDemo />
				<p>Now, you can see with 3 bits of Alpine sprinkled into this HTML, we've created an interactive "counter" component.</p>
				<p>Let's walk through what's happening briefly:</p>
				<h3 id="declaring-data">
					<a href="#declaring-data">Declaring data</a>
				</h3>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">div</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-data</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&#123; count: </span><span style="color: #005CC5;">0</span><span style="color: #24292E;"> &#125;</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<div x-data=\"{ count: 0 }\">"}</div></code></pre>
				<p>Everything in Alpine starts with an <code>x-data</code> directive. Inside of <code>x-data</code>, in plain JavaScript, you declare an object of data that Alpine will track.</p>
				<p>Every property inside this object will be made available to other directives inside this HTML element. In addition, when one of these properties changes, everything that relies on it will change as well.</p>
				<blockquote>
					<p><code>x-data</code> is required on a parent element for most Alpine directives to work.</p>
				</blockquote>
				<p>
					<a href="/directives/data">→ Read more about <code>x-data</code></a>
				</p>
				<p>Let's look at <code>x-on</code> and see how it can access and modify the <code>count</code> property from above:</p>
				<h3 id="listening-for-events">
					<a href="#listening-for-events">Listening for events</a>
				</h3>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">button</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-on</span><span style="color: #24292E;">:</span><span style="color: #6F42C1;">click</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">count</span><span style="color: #D73A49;">++</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;Increment&lt;/</span><span style="color: #22863A;">button</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<button x-on:click=\"count++\">Increment</button>"}</div></code></pre>
				<p><code>x-on</code> is a directive you can use to listen for any event on an element. We're listening for a <code>click</code> event in this case, so ours looks like <code>x-on:click</code>.</p>
				<p>You can listen for other events as you'd imagine. For example, listening for a <code>mouseenter</code> event would look like this: <code>x-on:mouseenter</code>.</p>
				<p>When a <code>click</code> event happens, Alpine will call the associated JavaScript expression, <code>count++</code> in our case. As you can see, we have direct access to data declared in the <code>x-data</code> expression.</p>
				<blockquote>
					<p>You will often see <code>&#64;</code> instead of <code>x-on:</code>. This is a shorter, friendlier syntax that many prefer. From now on, this documentation will likely use <code>&#64;</code> instead of <code>x-on:</code>.</p>
				</blockquote>
				<p>
					<a href="/directives/on">→ Read more about <code>x-on</code></a>
				</p>
				<h3 id="reacting-to-changes">
					<a href="#reacting-to-changes">Reacting to changes</a>
				</h3>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">span</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-text</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">count</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;&lt;/</span><span style="color: #22863A;">span</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<span x-text=\"count\"></span>"}</div></code></pre>
				<p><code>x-text</code> is an Alpine directive you can use to set the text content of an element to the result of a JavaScript expression.</p>
				<p>In this case, we're telling Alpine to always make sure that the contents of this <code>span</code> tag reflect the value of the <code>count</code> property.</p>
				<p>In case it's not clear, <code>x-text</code>, like most directives accepts a plain JavaScript expression as an argument. So for example, you could instead set its contents to: <code>x-text="count * 2"</code> and the text content of the <code>span</code> will now always be 2 times the value of <code>count</code>.</p>
				<p>
					<a href="/directives/text">→ Read more about <code>x-text</code></a>
				</p>
				<h2 id="building-a-dropdown">
					<a href="#building-a-dropdown">Building a dropdown</a>
				</h2>
				<p>Now that we've seen some basic functionality, let's keep going and look at an important directive in Alpine: <code>x-show</code>, by building a contrived "dropdown" component.</p>
				<p>Insert the following code into the <code>&lt;body&gt;</code> tag:</p>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">div</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-data</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&#123; open: </span><span style="color: #005CC5;">false</span><span style="color: #24292E;"> &#125;</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">button</span><span style="color: #24292E;"> &#64;</span><span style="color: #6F42C1;">click</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">open </span><span style="color: #D73A49;">=</span><span style="color: #24292E;">{" "}</span><span style="color: #D73A49;">!</span><span style="color: #24292E;"> open</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;Toggle&lt;/</span><span style="color: #22863A;">button</span><span style="color: #24292E;">&gt;</span></div><div class="line">{" "}</div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">div</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-show</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">open</span><span style="color: #032F62;">"</span><span style="color: #24292E;"> &#64;</span><span style="color: #6F42C1;">click</span><span style="color: #24292E;">.</span><span style="color: #6F42C1;">outside</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">open </span><span style="color: #D73A49;">=</span><span style="color: #24292E;">{" "}</span><span style="color: #005CC5;">false</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;Contents...&lt;/</span><span style="color: #22863A;">div</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;/</span><span style="color: #22863A;">div</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<div x-data=\"{ open: false }\">\n    <button @click=\"open = ! open\">Toggle</button>\n\n    <div x-show=\"open\" @click.outside=\"open = false\">Contents...</div>\n</div>"}</div></code></pre>
				<DropdownDemo />
				<p>If you load this component, you should see that the "Contents..." are hidden by default. You can toggle showing them on the page by clicking the "Toggle" button.</p>
				<p>The <code>x-data</code> and <code>x-on</code> directives should be familiar to you from the previous example, so we'll skip those explanations.</p>
				<h3 id="toggling-elements">
					<a href="#toggling-elements">Toggling elements</a>
				</h3>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">div</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-show</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">open</span><span style="color: #032F62;">"</span><span style="color: #24292E;"> ...&gt;Contents...&lt;/</span><span style="color: #22863A;">div</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<div x-show=\"open\" ...>Contents...</div>"}</div></code></pre>
				<p><code>x-show</code> is an extremely powerful directive in Alpine that can be used to show and hide a block of HTML on a page based on the result of a JavaScript expression, in our case: <code>open</code>.</p>
				<p>
					<a href="/directives/show">→ Read more about <code>x-show</code></a>
				</p>
				<h3 id="listening-for-a-click-outside">
					<a href="#listening-for-a-click-outside">Listening for a click outside</a>
				</h3>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">div</span><span style="color: #24292E;"> ... &#64;</span><span style="color: #6F42C1;">click</span><span style="color: #24292E;">.</span><span style="color: #6F42C1;">outside</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">open </span><span style="color: #D73A49;">=</span><span style="color: #24292E;">{" "}</span><span style="color: #005CC5;">false</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;Contents...&lt;/</span><span style="color: #22863A;">div</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<div ... @click.outside=\"open = false\">Contents...</div>"}</div></code></pre>
				<p>You'll notice something new in this example: <code>.outside</code>. Many directives in Alpine accept "modifiers" that are chained onto the end of the directive and are separated by periods.</p>
				<p>In this case, <code>.outside</code> tells Alpine to instead of listening for a click INSIDE the <code>&lt;div&gt;</code>, to listen for the click only if it happens OUTSIDE the <code>&lt;div&gt;</code>.</p>
				<p>This is a convenience helper built into Alpine because this is a common need and implementing it by hand is annoying and complex.</p>
				<p>
					<a href="/directives/on#modifiers">→ Read more about <code>x-on</code> modifiers</a>
				</p>
				<h2 id="building-a-search-input">
					<a href="#building-a-search-input">Building a search input</a>
				</h2>
				<p>Let's now build a more complex component and introduce a handful of other directives and patterns.</p>
				<p>Insert the following code into the <code>&lt;body&gt;</code> tag:</p>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">div</span></div><div class="line"><span style="color: #24292E;">{"    "}</span><span style="color: #6F42C1;">x-data</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&#123;</span></div><div class="line"><span style="color: #24292E;">{"        search: "}</span><span style="color: #032F62;">''</span><span style="color: #24292E;">,</span></div><div class="line">{" "}</div><div class="line"><span style="color: #24292E;">{"        items: ["}</span><span style="color: #032F62;">'foo'</span><span style="color: #24292E;">, </span><span style="color: #032F62;">'bar'</span><span style="color: #24292E;">, </span><span style="color: #032F62;">'baz'</span><span style="color: #24292E;">],</span></div><div class="line">{" "}</div><div class="line"><span style="color: #24292E;">{"        "}</span><span style="color: #D73A49;">get</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">filteredItems</span><span style="color: #24292E;">() &#123;</span></div><div class="line"><span style="color: #24292E;">{"            "}</span><span style="color: #D73A49;">return</span><span style="color: #24292E;">{" "}</span><span style="color: #005CC5;">this</span><span style="color: #24292E;">.items.</span><span style="color: #6F42C1;">filter</span><span style="color: #24292E;">(</span></div><div class="line"><span style="color: #24292E;">{"                "}</span><span style="color: #E36209;">i</span><span style="color: #24292E;">{" "}</span><span style="color: #D73A49;">=&gt;</span><span style="color: #24292E;"> i.</span><span style="color: #6F42C1;">startsWith</span><span style="color: #24292E;">(</span><span style="color: #005CC5;">this</span><span style="color: #24292E;">.search)</span></div><div class="line"><span style="color: #24292E;">{"            )"}</span></div><div class="line"><span style="color: #24292E;">{"        }"}</span></div><div class="line"><span style="color: #24292E;">{"    }"}</span><span style="color: #032F62;">"</span></div><div class="line"><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">input</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-model</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">search</span><span style="color: #032F62;">"</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">placeholder</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"Search..."</span><span style="color: #24292E;">&gt;</span></div><div class="line">{" "}</div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">ul</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"        <"}</span><span style="color: #22863A;">template</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-for</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">item </span><span style="color: #D73A49;">in</span><span style="color: #24292E;"> filteredItems</span><span style="color: #032F62;">"</span><span style="color: #24292E;"> :</span><span style="color: #6F42C1;">key</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">item</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"            <"}</span><span style="color: #22863A;">li</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-text</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">item</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;&lt;/</span><span style="color: #22863A;">li</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"        </"}</span><span style="color: #22863A;">template</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    </"}</span><span style="color: #22863A;">ul</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;/</span><span style="color: #22863A;">div</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<div\n    x-data=\"{\n        search: '',\n\n        items: ['foo', 'bar', 'baz'],\n\n        get filteredItems() {\n            return this.items.filter(\n                i => i.startsWith(this.search)\n            )\n        }\n    }\"\n>\n    <input x-model=\"search\" placeholder=\"Search...\">\n\n    <ul>\n        <template x-for=\"item in filteredItems\" :key=\"item\">\n            <li x-text=\"item\"></li>\n        </template>\n    </ul>\n</div>"}</div></code></pre>
				<SearchDemo />
				<p>By default, all of the "items" (foo, bar, and baz) will be shown on the page, but you can filter them by typing into the text input. As you type, the list of items will change to reflect what you're searching for.</p>
				<p>Now there's quite a bit happening here, so let's go through this snippet piece by piece.</p>
				<h3 id="multi-line-formatting">
					<a href="#multi-line-formatting">Multi line formatting</a>
				</h3>
				<p>The first thing I'd like to point out is that <code>x-data</code> now has a lot more going on in it than before. To make it easier to write and read, we've split it up into multiple lines in our HTML. This is completely optional and we'll talk more in a bit about how to avoid this problem altogether, but for now, we'll keep all of this JavaScript directly in the HTML.</p>
				<h3 id="binding-to-inputs">
					<a href="#binding-to-inputs">Binding to inputs</a>
				</h3>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">input</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-model</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">search</span><span style="color: #032F62;">"</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">placeholder</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"Search..."</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<input x-model=\"search\" placeholder=\"Search...\">"}</div></code></pre>
				<p>You'll notice a new directive we haven't seen yet: <code>x-model</code>.</p>
				<p><code>x-model</code> is used to "bind" the value of an input element with a data property: "search" from <code>x-data="&#123; search: '', ... &#125;"</code> in our case.</p>
				<p>This means that anytime the value of the input changes, the value of "search" will change to reflect that.</p>
				<p><code>x-model</code> is capable of much more than this simple example.</p>
				<p>
					<a href="/directives/model">→ Read more about <code>x-model</code></a>
				</p>
				<h3 id="computed-properties-using-getters">
					<a href="#computed-properties-using-getters">Computed properties using getters</a>
				</h3>
				<p>The next bit I'd like to draw your attention to is the <code>items</code> and <code>filteredItems</code> properties from the <code>x-data</code> directive.</p>
				<pre><code data-theme="github-light" data-lang="js" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&#123;</span></div><div class="line"><span style="color: #24292E;">{"    "}</span><span style="color: #D73A49;">...</span></div><div class="line"><span style="color: #24292E;">{"    "}</span><span style="color: #6F42C1;">items</span><span style="color: #24292E;">: [</span><span style="color: #032F62;">'foo'</span><span style="color: #24292E;">, </span><span style="color: #032F62;">'bar'</span><span style="color: #24292E;">, </span><span style="color: #032F62;">'baz'</span><span style="color: #24292E;">],</span></div><div class="line">{" "}</div><div class="line"><span style="color: #24292E;">{"    get "}</span><span style="color: #6F42C1;">filteredItems</span><span style="color: #24292E;">() &#123;</span></div><div class="line"><span style="color: #24292E;">{"        "}</span><span style="color: #D73A49;">return</span><span style="color: #24292E;">{" "}</span><span style="color: #005CC5;">this</span><span style="color: #24292E;">.items.</span><span style="color: #6F42C1;">filter</span><span style="color: #24292E;">(</span></div><div class="line"><span style="color: #24292E;">{"            "}</span><span style="color: #E36209;">i</span><span style="color: #24292E;">{" "}</span><span style="color: #D73A49;">=&gt;</span><span style="color: #24292E;"> i.</span><span style="color: #6F42C1;">startsWith</span><span style="color: #24292E;">(</span><span style="color: #005CC5;">this</span><span style="color: #24292E;">.search)</span></div><div class="line"><span style="color: #24292E;">{"        )"}</span></div><div class="line"><span style="color: #24292E;">{"    }"}</span></div><div class="line"><span style="color: #24292E;">&#125;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n{\n    ...\n    items: ['foo', 'bar', 'baz'],\n\n    get filteredItems() {\n        return this.items.filter(\n            i => i.startsWith(this.search)\n        )\n    }\n}"}</div></code></pre>
				<p>The <code>items</code> property should be self-explanatory. Here we are setting the value of <code>items</code> to a JavaScript array of 3 different items (foo, bar, and baz).</p>
				<p>The interesting part of this snippet is the <code>filteredItems</code> property.</p>
				<p>Denoted by the <code>get</code> prefix for this property, <code>filteredItems</code> is a "getter" property in this object. This means we can access <code>filteredItems</code> as if it was a normal property in our data object, but when we do, JavaScript will evaluate the provided function under the hood and return the result.</p>
				<p>It's completely acceptable to forgo the <code>get</code> and just make this a method that you can call from the template, but some prefer the nicer syntax of the getter.</p>
				<p>
					<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get">→ Read more about JavaScript getters</a>
				</p>
				<p>Now let's look inside the <code>filteredItems</code> getter and make sure we understand what's going on there:</p>
				<pre><code data-theme="github-light" data-lang="js" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #D73A49;">return</span><span style="color: #24292E;">{" "}</span><span style="color: #005CC5;">this</span><span style="color: #24292E;">.items.</span><span style="color: #6F42C1;">filter</span><span style="color: #24292E;">(</span></div><div class="line"><span style="color: #24292E;">{"    "}</span><span style="color: #E36209;">i</span><span style="color: #24292E;">{" "}</span><span style="color: #D73A49;">=&gt;</span><span style="color: #24292E;"> i.</span><span style="color: #6F42C1;">startsWith</span><span style="color: #24292E;">(</span><span style="color: #005CC5;">this</span><span style="color: #24292E;">.search)</span></div><div class="line"><span style="color: #24292E;">)</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\nreturn this.items.filter(\n    i => i.startsWith(this.search)\n)"}</div></code></pre>
				<p>This is all plain JavaScript. We are first getting the array of items (foo, bar, and baz) and filtering them using the provided callback: <code>i =&gt; i.startsWith(this.search)</code>.</p>
				<p>By passing in this callback to <code>filter</code>, we are telling JavaScript to only return the items that start with the string: <code>this.search</code>, which like we saw with <code>x-model</code> will always reflect the value of the input.</p>
				<p>You may notice that up until now, we haven't had to use <code>this.</code> to reference properties. However, because we are working directly inside the <code>x-data</code> object, we must reference any properties using <code>this.[property]</code> instead of simply <code>[property]</code>.</p>
				<p>Because Alpine is a "reactive" framework. Any time the value of <code>this.search</code> changes, parts of the template that use <code>filteredItems</code> will automatically be updated.</p>
				<h3 id="looping-elements">
					<a href="#looping-elements">Looping elements</a>
				</h3>
				<p>Now that we understand the data part of our component, let's understand what's happening in the template that allows us to loop through <code>filteredItems</code> on the page.</p>
				<pre><code data-theme="github-light" data-lang="alpine" class="torchlight" style="background-color: #fff; --theme-selection-background: #e2e5e9;"><div class="line"><span style="color: #24292E;">&lt;</span><span style="color: #22863A;">ul</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    <"}</span><span style="color: #22863A;">template</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-for</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">item </span><span style="color: #D73A49;">in</span><span style="color: #24292E;"> filteredItems</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"        <"}</span><span style="color: #22863A;">li</span><span style="color: #24292E;">{" "}</span><span style="color: #6F42C1;">x-text</span><span style="color: #24292E;">=</span><span style="color: #032F62;">"</span><span style="color: #24292E;">item</span><span style="color: #032F62;">"</span><span style="color: #24292E;">&gt;&lt;/</span><span style="color: #22863A;">li</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">{"    </"}</span><span style="color: #22863A;">template</span><span style="color: #24292E;">&gt;</span></div><div class="line"><span style="color: #24292E;">&lt;/</span><span style="color: #22863A;">ul</span><span style="color: #24292E;">&gt;</span></div><div aria-hidden="true" hidden tabindex="-1" style="display: none;" class="torchlight-copy-target">{"\n<ul>\n    <template x-for=\"item in filteredItems\">\n        <li x-text=\"item\"></li>\n    </template>\n</ul>"}</div></code></pre>
				<p>The first thing to notice here is the <code>x-for</code> directive. <code>x-for</code> expressions take the following form: <code>[item] in [items]</code> where [items] is any array of data, and [item] is the name of the variable that will be assigned to an iteration inside the loop.</p>
				<p>Also notice that <code>x-for</code> is declared on a <code>&lt;template&gt;</code> element and not directly on the <code>&lt;li&gt;</code>. This is a requirement of using <code>x-for</code>. It allows Alpine to leverage the existing behavior of <code>&lt;template&gt;</code> tags in the browser to its advantage.</p>
				<p>Now any element inside the <code>&lt;template&gt;</code> tag will be repeated for every item inside <code>filteredItems</code> and all expressions evaluated inside the loop will have direct access to the iteration variable (<code>item</code> in this case).</p>
				<p>
					<a href="/directives/for">→ Read more about <code>x-for</code></a>
				</p>
				<h2 id="recap">
					<a href="#recap">Recap</a>
				</h2>
				<p>If you've made it this far, you've been exposed to the following directives in Alpine:</p>
				<ul>
					<li>x-data</li>
					<li>x-on</li>
					<li>x-text</li>
					<li>x-show</li>
					<li>x-model</li>
					<li>x-for</li>
				</ul>
				<p>That's a great start, however, there are many more directives to sink your teeth into. The best way to absorb Alpine is to read through this documentation. No need to comb over every word, but if you at least glance through every page you will be MUCH more effective when using Alpine.</p>
				<p>Happy Coding!</p>
				<Sponsor wrapper="my-12 border-y border-gray-200 py-6 xl:hidden" label="mb-3 block text-xs font-semibold uppercase tracking-wider text-gray-400" />
				<div class="flex justify-between border-t border-gray-200 pt-4 text-gray-700">
					<div></div>
					<div>
						<a class="font-bold text-cyan-400" href="/upgrade-guide">Upgrade From V2 →</a>
					</div>
				</div>
				<p class="mt-6 text-center text-sm text-gray-600">Code highlighting provided by <a href="https://torchlight.dev" target="__blank" class="font-semibold text-cyan-400">Torchlight</a></p>
				<div class="mt-6 flex items-center justify-center gap-4 text-center text-sm text-gray-600"></div>
				<p class="port-attribution" style="position: fixed; right: 8px; bottom: 8px; z-index: 50; max-width: 360px; margin: 0; padding: 6px 10px; border-radius: 6px; font: 12px/1.4 system-ui, sans-serif; text-align: left; color: #222; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);">Unofficial demo copy of <a style="color: #1a4fa0; text-decoration: underline;" href="https://alpinejs.dev">alpinejs.dev</a>, moved to <a style="color: #1a4fa0; text-decoration: underline;" href="https://markless.dev">Markless</a> with markless-migrate. Alpine.js and its documentation © Caleb Porzio and contributors, <a style="color: #1a4fa0; text-decoration: underline;" href="https://github.com/alpinejs/alpine/blob/main/LICENSE.md">MIT license</a>.</p>
			</div>
		</main>
		<Toc headings={START_HEADINGS} />
	</div>
}
