import { computed, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { advance, INITIAL_CODE, jobProgressTemplate, jobStatusTemplate, responseEntry, startJob, type Entry, type Job } from '../../../components/progress-bar.ts';

// Ported by hand from htmx.org's demo page (www/content/examples/progress-bar.md): what htmx, class-tools and the page's
// sinon fake server did is Markless state here, with htmx's classes and timings (80 ms answers, 20 ms settle, 600 ms polls).
export default function ProgressBar() @{
	// status: the job as the last outerHTML swap drew it (the heading, the poll's trigger, the restart button); job: as
	// the last poll drew the bar; progress: #pb's width, which htmx settles 20 ms after each swap so its transition runs.
	let status = state<Job | null>(null);
	let job = state<Job | null>(null);
	let progress = state(0);
	// Each outerHTML swap puts a new div in the old one's place.
	let swaps = state(0);
	let starting = state(false);
	let polling = state(false);
	let fetchingJob = state(false);
	let shown = state(false);
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});
	// What #demo-canvas shows: the start button until the first answer, then the div each outerHTML swap puts in, then its
	// restart button once the job is complete.
	const startShown = computed(() => (status === null ? [0] : []));
	const generation = computed(() => (status === null ? [] : [swaps]));
	const restartShown = computed(() => (status?.complete ? [swaps] : []));

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Progress Bar</h1>
			{" "}
			{" "}
			{" "}
			<p>This example shows how to implement a smoothly scrolling progress bar.</p>
			{" "}
			<p>{"We start with an initial state with a button that issues a "}<code>POST</code>{" to "}<code>/start</code>{" to begin the job:"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"this\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">h3</span><span>&gt;Start Progress&lt;/</span><span style="color:#e06c75;">h3</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn primary\" "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">"/start"</span><span>{">\n"}</span><span>{"            Start Job\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>This div is then replaced with a new div containing status and a progress bar that reloads itself every 600ms:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"done\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/job\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"outerHTML\" "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"this"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"h3 "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"status\" "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"pblabel\" "}</span><span style="color:#d19a66;">tabindex</span><span>=</span><span style="color:#98c379;">{"\"-1\" "}</span><span style="color:#d19a66;">autofocus</span><span>&gt;Running&lt;/</span><span style="color:#e06c75;">h3</span><span>{">\n"}</span><span>{"\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/job/progress\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"every 600ms\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"this\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"innerHTML"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"progress\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"progressbar\" "}</span><span style="color:#d19a66;">aria-valuemin</span><span>=</span><span style="color:#98c379;">{"\"0\" "}</span><span style="color:#d19a66;">aria-valuemax</span><span>=</span><span style="color:#98c379;">{"\"100\" "}</span><span style="color:#d19a66;">aria-valuenow</span><span>=</span><span style="color:#98c379;">{"\"0\" "}</span><span style="color:#d19a66;">aria-labelledby</span><span>=</span><span style="color:#98c379;">"pblabel"</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"pb\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"progress-bar\" "}</span><span style="color:#d19a66;">style</span><span>=</span><span style="color:#98c379;">"</span><span>width:</span><span style="color:#d19a66;">0%</span><span style="color:#98c379;">"</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"\n"}</span></code></pre>
			{" "}
			<p>{"This progress bar is updated every 600 milliseconds, with the “width” style attribute and "}<code>aria-valuenow</code>{" attributed set to current progress value. Because there is an id on the progress bar div, htmx will smoothly transition between requests by settling the style attribute into its new value. This, when coupled with CSS transitions, makes the visual transition continuous rather than jumpy."}</p>
			{" "}
			<p>{"Finally, when the process is complete, a server returns "}<code>HX-Trigger: done</code>{" header, which triggers an update of the UI to “Complete” state with a restart button added to the UI (we are using the "}<a rel="noopener" target="_blank" href="https://github.com/bigskysoftware/htmx-extensions/blob/main/src/class-tools/README.md"><code>class-tools</code></a>{" extension in this example to add fade-in effect on the button):"}</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"done\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/job\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"outerHTML\" "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"this"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"h3 "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"status\" "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"pblabel\" "}</span><span style="color:#d19a66;">tabindex</span><span>=</span><span style="color:#98c379;">{"\"-1\" "}</span><span style="color:#d19a66;">autofocus</span><span>&gt;Complete&lt;/</span><span style="color:#e06c75;">h3</span><span>{">\n"}</span><span>{"\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/job/progress\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"none\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"this\"\n"}</span><span>{"    "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"innerHTML"</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"progress\" "}</span><span style="color:#d19a66;">role</span><span>=</span><span style="color:#98c379;">{"\"progressbar\" "}</span><span style="color:#d19a66;">aria-valuemin</span><span>=</span><span style="color:#98c379;">{"\"0\" "}</span><span style="color:#d19a66;">aria-valuemax</span><span>=</span><span style="color:#98c379;">{"\"100\" "}</span><span style="color:#d19a66;">aria-valuenow</span><span>=</span><span style="color:#98c379;">{"\"122\" "}</span><span style="color:#d19a66;">aria-labelledby</span><span>=</span><span style="color:#98c379;">"pblabel"</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"pb\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"progress-bar\" "}</span><span style="color:#d19a66;">style</span><span>=</span><span style="color:#98c379;">"</span><span>width:</span><span style="color:#d19a66;">122%</span><span style="color:#98c379;">"</span><span>{">\n"}</span><span>{"      </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"restart-btn\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn primary\" "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/start\" "}</span><span style="color:#d19a66;">classes</span><span>=</span><span style="color:#98c379;">"add show:600ms"</span><span>{">\n"}</span><span>{"    Restart Job\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>This example uses styling cribbed from the bootstrap progress bar:</p>
			{" "}
			<pre data-lang="css" style="background-color:#1f2329;color:#abb2bf;" class="language-css "><code class="language-css" data-lang="css"><span style="color:#d19a66;">{".progress "}</span><span>{"{\n"}</span><span>{"    height: "}</span><span style="color:#d19a66;">20px</span><span>{";\n"}</span><span>{"    margin-bottom: "}</span><span style="color:#d19a66;">20px</span><span>{";\n"}</span><span>{"    overflow: hidden;\n"}</span><span>{"    background-color: "}</span><span style="color:#56b6c2;">#f5f5f5</span><span>{";\n"}</span><span>{"    border-radius: "}</span><span style="color:#d19a66;">4px</span><span>{";\n"}</span><span>{"    box-shadow: inset "}</span><span style="color:#d19a66;">{"0 1px 2px "}</span><span style="color:#56b6c2;">rgba</span><span>(</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">.1</span><span>{");\n"}</span><span>{"}\n"}</span><span style="color:#d19a66;">{".progress-bar "}</span><span>{"{\n"}</span><span>{"    float: left;\n"}</span><span>{"    width: "}</span><span style="color:#d19a66;">0%</span><span>{";\n"}</span><span>{"    height: "}</span><span style="color:#d19a66;">100%</span><span>{";\n"}</span><span>{"    font-size: "}</span><span style="color:#d19a66;">12px</span><span>{";\n"}</span><span>{"    line-height: "}</span><span style="color:#d19a66;">20px</span><span>{";\n"}</span><span>{"    color: "}</span><span style="color:#56b6c2;">#fff</span><span>{";\n"}</span><span>{"    text-align: center;\n"}</span><span>{"    background-color: "}</span><span style="color:#56b6c2;">#337ab7</span><span>{";\n"}</span><span>{"    -webkit-box-shadow: inset "}</span><span style="color:#d19a66;">{"0 -1px 0 "}</span><span style="color:#56b6c2;">rgba</span><span>(</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">.15</span><span>{");\n"}</span><span>{"    box-shadow: inset "}</span><span style="color:#d19a66;">{"0 -1px 0 "}</span><span style="color:#56b6c2;">rgba</span><span>(</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">0</span><span>,</span><span style="color:#d19a66;">.15</span><span>{");\n"}</span><span>{"    -webkit-transition: width "}</span><span style="color:#d19a66;">{".6s "}</span><span>{"ease;\n"}</span><span>{"    -o-transition: width "}</span><span style="color:#d19a66;">{".6s "}</span><span>{"ease;\n"}</span><span>{"    transition: width "}</span><span style="color:#d19a66;">{".6s "}</span><span>{"ease;\n"}</span><span>{"}\n"}</span></code></pre>
			{" "}
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
			{/* The page's init("/demo") wrote the start button as it loaded. Start Job and Restart Job (hx-post="/start") carry
			    htmx-request until the fake server answers 80 ms later; the answer replaces the div (hx-target="this",
			    hx-swap="outerHTML"), and at the settle 20 ms on htmx focuses the autofocus heading, settles #pb's width and starts
			    the div's poll (hx-trigger="every 600ms"). The poll's answer redraws the bar (hx-swap="innerHTML"); the last one
			    sends HX-Trigger: done, which makes the outer div GET /job, whose answer replaces it with the Complete state and
			    the restart button class-tools fades in (classes="add show:600ms"). */}
			<div
				id="demo-canvas"
				onClick={(event) => {
					const button = (event.target as Element).closest('button[hx-post="/start"]');
					if (!button || starting) return;
					starting = true;
					const swapIn = (next: Job) => {
						status = next;
						job = next;
						shown = false;
						swaps = swaps + 1;
						const mine = swaps;
						setTimeout(() => {
							if (swaps !== mine) return;
							progress = next.percentComplete;
							document.getElementById('pblabel')?.focus();
							if (next.complete) {
								setTimeout(() => {
									if (swaps === mine) shown = true;
								}, 600);
								return;
							}
							const poll = () =>
								setTimeout(() => {
									if (swaps !== mine) return;
									polling = true;
									poll();
									setTimeout(() => {
										polling = false;
										if (swaps !== mine) return;
										const polled = advance(job!);
										if (polled.complete) {
											fetchingJob = true;
											setTimeout(() => {
												const done = advance(polled);
												log = [responseEntry(log.length + 1, 'GET', '/job', {}, jobStatusTemplate(done)), ...log];
												selected = `req-${log.length}`;
												fetchingJob = false;
												swapIn(done);
											}, 80);
										}
										log = [responseEntry(log.length + 1, 'GET', '/job/progress', polled.complete ? { 'HX-Trigger': 'done' } : {}, jobProgressTemplate(polled)), ...log];
										selected = `req-${log.length}`;
										job = polled;
										setTimeout(() => {
											if (swaps === mine) progress = polled.percentComplete;
										}, 20);
									}, 80);
								}, 600);
							poll();
						}, 20);
					};
					setTimeout(() => {
						const fresh = startJob();
						log = [responseEntry(log.length + 1, 'POST', '/start', {}, jobStatusTemplate(fresh)), ...log];
						selected = `req-${log.length}`;
						starting = false;
						swapIn(fresh);
					}, 80);
				}}
			>
				@for (const _ of startShown; key _) {
					<div hx-target="this" hx-swap="outerHTML">
						<h3>Start Progress</h3>
						<button class={starting ? 'btn primary htmx-request' : 'btn primary'} hx-post="/start">
							{'\n            Start Job\n  '}
						</button>
					</div>
				}
				@for (const swap of generation; key swap) {
					<div hx-trigger="done" hx-get="/job" hx-swap="outerHTML" hx-target="this" class={fetchingJob ? 'htmx-request' : undefined}>
						<h3 role="status" id="pblabel" tabindex="-1" autofocus="">{status!.complete ? 'Complete' : 'Running'}</h3>
						<div
							hx-get="/job/progress"
							hx-trigger={status!.complete ? 'none' : 'every 600ms'}
							hx-target="this"
							hx-swap="innerHTML"
							class={polling ? 'htmx-request' : undefined}
						>
							<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={String(job!.percentComplete)} aria-labelledby="pblabel">
								<div id="pb" class="progress-bar" style={`width:${progress}%`}></div>
							</div>
						</div>
						@for (const _ of restartShown; key _) {
							<button
								id="restart-btn"
								class={['btn primary', shown ? 'show' : '', starting ? 'htmx-request' : ''].filter(Boolean).join(' ')}
								hx-post="/start"
								classes="add show:600ms"
							>
								{'\n  Restart Job\n'}
							</button>
						}
					</div>
				}
			</div>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
