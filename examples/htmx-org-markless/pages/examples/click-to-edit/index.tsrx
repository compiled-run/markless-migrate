import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { displayTemplate, fillForm, formTemplate, INITIAL_HTML, JOE, responseEntry, type Contact, type Entry } from '../../../components/click-to-edit.ts';

export default function ClickToEdit() @{
	let contact = state<Contact>(JOE);
	let editing = state(false);
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const first = element<HTMLInputElement>();
	const last = element<HTMLInputElement>();
	const mail = element<HTMLInputElement>();
	const current = computed(() => {
		const entries = log;
		const id = selected;
		return entries.find((entry) => entry.id === id);
	});
	// Fields read through a local: a template read nested under a state path is not lowered in Markless 0.4.0.
	const currentMethod = computed(() => {
		const entry = current;
		return entry?.method ?? '';
	});
	const currentUrl = computed(() => {
		const entry = current;
		return entry?.url ?? '';
	});
	const currentParams = computed(() => {
		const entry = current;
		return entry?.params ?? '';
	});
	const currentCode = computed(() => {
		const entry = current;
		return entry?.code ?? '';
	});
	const currentTail = computed(() => {
		const entry = current;
		return entry && !entry.truncated ? ' ' : '';
	});
	const currentId = computed(() => {
		const entry = current;
		return entry?.id ?? '';
	});
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader />
		<main class="c content ">
			<h1>Click to Edit</h1>
			<p>The click to edit pattern provides a way to offer inline editing of all or part of a record without a page refresh.</p>
			<ul>
				<li>This pattern starts with a UI that shows the details of a contact. The div has a button that will get the editing UI for the contact from <code>/contact/1/edit</code></li>
			</ul>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">div </span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"this" </span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">label</span><span>&gt;First Name&lt;/</span><span style="color:#e06c75;">label</span><span>&gt;: Joe&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">label</span><span>&gt;Last Name&lt;/</span><span style="color:#e06c75;">label</span><span>&gt;: Blow&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">label</span><span>&gt;Email&lt;/</span><span style="color:#e06c75;">label</span><span>&gt;: joe&#64;blow.com&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">button </span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/contact/1/edit" </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn primary"</span><span>{">\n"}</span><span>{"    Click To Edit\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			<ul>
				<li>This returns a form that can be used to edit the contact</li>
			</ul>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">form </span><span style="color:#d19a66;">hx-put</span><span>=</span><span style="color:#98c379;">"/contact/1" </span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"this" </span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;First Name&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">input </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"text" </span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"firstName" </span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"Joe"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"form-group"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Last Name&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">input </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"text" </span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"lastName" </span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"Blow"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"form-group"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Email Address&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">input </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"email" </span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"email" </span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"joe&#64;blow.com"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">button </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn" </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"submit"</span><span>&gt;Submit&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">button </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn" </span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/contact/1"</span><span>&gt;Cancel&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">form</span><span>{">\n"}</span></code></pre>
			<ul>
				<li>The form issues a <code>PUT</code> back to <code>/contact/1</code>, following the usual REST-ful pattern.</li>
			</ul>
			<div id="demo-server-info" class={showInfo ? 'show' : ''}>
				<div>
					Server Requests<span id="request-count">{count}</span>{' '}
					<a id="request-info-toggler" style="cursor: pointer" onClick={() => (showInfo = !showInfo)}>{showInfo ? '↓ Hide' : '↑ Show'}</a>
				</div>
				<div id="demo-activity" class="row">
					<div class="3 col">
						{/* One handler for the whole timeline: a handler inside a keyed row loses its row after resume in Markless 0.4.0. */}
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
						{/* demo.js keeps every entry and hides all but the selected one; only the selected one is drawn here. */}
						<div id={currentId} style={currentId ? '' : 'display: none;'}>
							<span class="activity response">
								<div>
									<b>{currentMethod}</b>{' '}<span>{currentUrl}</span>
								</div>
								<div>parameters: <span>{currentParams}</span></div>
								<div>headers: &#123;&#125;</div>
								<div>
									<b>Response</b>
									<pre class="language-html"><code class="language-html">{currentCode}</code><span>{currentTail}</span></pre>
								</div>
							</span>
						</div>
						<div id="init" style={currentId ? 'display: none;' : ''}>
							<span class="activity initial">
								<b>HTML</b>
								<pre class="language-html"><code class="language-html">{INITIAL_HTML}</code></pre>
							</span>
						</div>
					</div>
				</div>
			</div>
			<h2><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">🔗</a>Demo</h2>
			<div id="demo-canvas">
				{/* htmx swaps one for the other; an @if arm cannot hold the form's value bindings in Markless 0.4.0, so both stay and one is hidden. */}
				<div style={editing ? 'display: none;' : ''}>
					<div><label>First Name</label>: {contact.firstName}</div>
					<div><label>Last Name</label>: {contact.lastName}</div>
					<div><label>Email Address</label>: {contact.email}</div>
					<button
						class="btn primary"
						onClick={() => {
							editing = true;
							log = [responseEntry(log.length + 1, 'GET', '/contact/1/edit', {}, formTemplate(contact)), ...log];
							selected = `req-${log.length}`;
							// htmx swaps in a fresh form; the value binding does not reach the fields' values in Markless 0.4.0, so they are set here.
							fillForm([first, last, mail], contact);
						}}
					>
						{' Click To Edit '}
					</button>
				</div>
				<form
					style={editing ? '' : 'display: none;'}
					class={editing ? 'swapped-in' : ''}
					onAnimationStart={() => first?.focus()}
					onSubmit={(event) => {
						event.preventDefault();
						const data = new FormData(event.target as HTMLFormElement);
						const next = { firstName: String(data.get('firstName')), lastName: String(data.get('lastName')), email: String(data.get('email')) };
						contact = next;
						editing = false;
						log = [responseEntry(log.length + 1, 'PUT', '/contact/1', next, displayTemplate(next)), ...log];
						selected = `req-${log.length}`;
					}}
				>
					<div>
						<label for="firstName">First Name</label>
						<input el={first} autofocus="" type="text" id="firstName" name="firstName" value={contact.firstName} />
					</div>
					<div class="form-group">
						<label for="lastName">Last Name</label>
						<input el={last} type="text" id="lastName" name="lastName" value={contact.lastName} />
					</div>
					<div class="form-group">
						<label for="email">Email Address</label>
						<input el={mail} type="email" id="email" name="email" value={contact.email} />
					</div>
					<button class="btn primary" type="submit">Submit</button>
					{' '}
					<button
						class="btn danger"
						onClick={(event) => {
							event.preventDefault();
							editing = false;
							log = [responseEntry(log.length + 1, 'GET', '/contact/1', {}, displayTemplate(contact)), ...log];
							selected = `req-${log.length}`;
						}}
					>
						Cancel
					</button>
				</form>
			</div>
		</main>
		<SiteFooter />
	</div>
}
