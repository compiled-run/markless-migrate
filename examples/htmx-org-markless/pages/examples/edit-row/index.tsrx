import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { CONTACTS, editMarkup, editTemplate, INITIAL_CODE, pushEntry, responseHtml, rowMarkup, rowTemplate, showEntry, type Contact } from '../../../components/edit-row.ts';

interface SweetAlert {
	fire(options: Record<string, unknown>): Promise<{ readonly isConfirmed: boolean }>;
}

export default function EditRow() @{
	// The contacts as the fake server holds them; the rows themselves are swapped as htmx swapped them.
	let contacts = state<readonly Contact[]>(CONTACTS);
	let requests = state(0);
	let showInfo = state(false);
	const timeline = element<HTMLOListElement>();
	const current = element<HTMLDivElement>();
	const body = element<HTMLTableSectionElement>();
	const count = computed(() => {
		const n = requests;
		return n ? `: ${n}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Edit Row</h1>
			{" "}
			<p>This example shows how to implement editable rows. First let’s look at the table body:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"table "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"table delete-row-example"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;Name&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;Email&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">th</span><span>&gt;&lt;/</span><span style="color:#e06c75;">th</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">thead</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"tbody "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"closest tr\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"    ...\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">tbody</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">table</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>This will tell the requests from within the table to target the closest enclosing row that the request is triggered on and to replace the entire row.</p>
			{" "}
			<p>Here is the HTML for a row:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">td</span><span>&gt;$&#123;contact.name&#125;&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">td</span><span>&gt;$&#123;contact.email&#125;&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"      <"}</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"        <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn danger\"\n"}</span><span>{"                "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">{"\"/contact/${contact.id}/edit\"\n"}</span><span>{"                "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"\"edit\"\n"}</span><span>{"                "}</span><span style="color:#d19a66;">onClick</span><span>=</span><span style="color:#98c379;">{"\"let editing = document.querySelector('.editing')\n"}</span><span style="color:#98c379;">{"                         if(editing) {\n"}</span><span style="color:#98c379;">{"                           Swal.fire({title: 'Already Editing',\n"}</span><span style="color:#98c379;">{"                                      showCancelButton: true,\n"}</span><span style="color:#98c379;">{"                                      confirmButtonText: 'Yep, Edit This Row!',\n"}</span><span style="color:#98c379;">{"                                      text:'Hey!  You are already editing a row!  Do you want to cancel that edit and continue?'})\n"}</span><span style="color:#98c379;">{"                           .then((result) => {\n"}</span><span style="color:#98c379;">{"                                if(result.isConfirmed) {\n"}</span><span style="color:#98c379;">{"                                   htmx.trigger(editing, 'cancel')\n"}</span><span style="color:#98c379;">{"                                   htmx.trigger(this, 'edit')\n"}</span><span style="color:#98c379;">{"                                }\n"}</span><span style="color:#98c379;">{"                            })\n"}</span><span style="color:#98c379;">{"                         } else {\n"}</span><span style="color:#98c379;">{"                            htmx.trigger(this, 'edit')\n"}</span><span style="color:#98c379;">{"                         }\""}</span><span>{">\n"}</span><span>{"          Edit\n"}</span><span>{"        </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"      </"}</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"Here we are getting a bit fancy and only allowing one row at a time to be edited, using some JavaScript. We check to see if there is a row with the "}<code>.editing</code>{" class on it and confirm that the user wants to edit this row and dismiss the other one. If so, we send a cancel event to the other row so it will issue a request to go back to its initial state."}</p>
			{" "}
			<p>{"We then trigger the "}<code>edit</code>{" event on the current element, which triggers the htmx request to get the editable version of the row."}</p>
			{" "}
			<p>{"Note that if you didn’t care if a user was editing multiple rows, you could omit the hyperscript and custom "}<code>hx-trigger</code>, and just let the normal click handling work with htmx. You could also implement mutual exclusivity by simply targeting the entire table when the Edit button was clicked. Here we wanted to show how to integrate htmx and JavaScript to solve the problem and narrow down the server interactions a bit, plus we get to use a nice SweetAlert confirm dialog.</p>
			{" "}
			<p>Finally, here is what the row looks like when the data is being edited:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"tr "}</span><span style="color:#d19a66;">hx-trigger</span><span>=</span><span style="color:#98c379;">{"'cancel' "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"'editing' "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/contact/$&#123;contact.id&#125;"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">autofocus name</span><span>=</span><span style="color:#98c379;">{"'name' "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'$&#123;contact.name&#125;'</span><span>&gt;&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>&gt;&lt;</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"'email' "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">'$&#123;contact.email&#125;'</span><span>&gt;&lt;/</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn danger\" "}</span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/contact/$&#123;contact.id&#125;"</span><span>{">\n"}</span><span>{"      Cancel\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"btn danger\" "}</span><span style="color:#d19a66;">hx-put</span><span>=</span><span style="color:#98c379;">{"\"/contact/${contact.id}\" "}</span><span style="color:#d19a66;">hx-include</span><span>=</span><span style="color:#98c379;">"closest tr"</span><span>{">\n"}</span><span>{"      Save\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">td</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">tr</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"Here we have a few things going on: First off the row itself can respond to the "}<code>cancel</code>{" event, which will bring back the read-only version of the row. There is a cancel button that allows cancelling the current edit. Finally, there is a save button that issues a "}<code>PUT</code>{" to update the contact. Note that there is an "}<a href="/attributes/hx-include/"><code>hx-include</code></a>{" that includes all the inputs in the closest row. Tables rows are notoriously difficult to use with forms due to HTML constraints (you can’t put a "}<code>form</code>{" directly inside a "}<code>tr</code>) so this makes things a bit nicer to deal with.</p>
			{" "}
			{" "}
			<div id="demo-server-info" class={showInfo ? 'show' : ''}>
				<div>
					Server Requests<span id="request-count">{count}</span>{' '}
					<a id="request-info-toggler" style="cursor: pointer" onClick={() => (showInfo = !showInfo)}>{showInfo ? '↓ Hide' : '↑ Show'}</a>
				</div>
				<div id="demo-activity" class="row">
					<div class="3 col">
						{/* demo.js's pushActivityChip() inserts each entry above these; one handler stands in for each entry's showTimelineEntry. */}
						<ol
							el={timeline}
							id="demo-timeline"
							reversed=""
							onClick={(event) => {
								const link = (event.target as Element).closest('a')?.parentElement;
								if (link && timeline && current) showEntry(timeline, current, link.id.replace(/-link$/, ''));
							}}
						>
							<li id="init-link" class="active">
								<a style="cursor: pointer">Initial State</a>
							</li>
						</ol>
					</div>
					<div el={current} id="demo-current-request" class="9 col">
						<div id="init">
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
			{/* The page's init("/demo") wrote this table as it loaded. Each request below is answered as the page's sinon server
			    answered it, 80 ms later; the element that made it carries htmx-request until then, and the answer replaces the
			    closest tr (the body's hx-target and hx-swap="outerHTML"). */}
			<div id="demo-canvas">
				<table class="table delete-row-example">
					<thead>
						<tr>
							<th>Name</th>
							<th>Email</th>
							<th></th>
						</tr>
					</thead>
					<tbody
						el={body}
						onClick={(event) => {
							const button = (event.target as Element).closest('button');
							const tr = button?.closest('tr');
							if (!button || !tr || !body) return;
							const id = Array.prototype.indexOf.call(body.children, tr);
							// htmx sends the request from this element after 80 ms of the sinon server, drops a second one while it
							// is in flight, logs it and swaps the answer into the closest tr (the body's hx-target and hx-swap).
							const request = (from: Element, method: string, url: string, params: Record<string, string>, after: () => [string, string]) => {
								if (from.classList.contains('htmx-request')) return;
								from.classList.add('htmx-request');
								setTimeout(() => {
									from.classList.remove('htmx-request');
									const [logged, markup] = after();
									requests = requests + 1;
									if (timeline && current) pushEntry(timeline, current, `${method} ${url}`, `req-${requests}`, responseHtml(method, url, params, logged));
									const row = from.closest('tr');
									if (!row || !body) return;
									const n = Array.prototype.indexOf.call(body.children, row);
									row.outerHTML = markup;
									// htmx focuses the swapped-in row's autofocus input.
									body.children.item(n)?.querySelector<HTMLInputElement>('input[autofocus]')?.focus();
								}, 80);
							};
							const cancel = (row: Element, from: Element) => {
								const n = Array.prototype.indexOf.call(body!.children, row);
								request(from, 'GET', `/contact/${n}`, {}, () => {
									const contact = contacts.find((_, i) => i === n)!;
									return [rowTemplate({ ...contact, id: n }), rowMarkup(contact)];
								});
							};
							const label = button.textContent!.trim();
							if (label === 'Cancel') return cancel(tr, button);
							if (label === 'Save') {
								// hx-put="/contact/N" with hx-include="closest tr": the server keeps the row's inputs and answers with the row.
								const inputs = tr.querySelectorAll('input');
								const saved = { name: inputs[0]!.value, email: inputs[1]!.value };
								return request(button, 'PUT', `/contact/${id}`, saved, () => {
									contacts = contacts.map((c, i) => (i === id ? saved : c));
									return [rowTemplate({ ...saved, id }), rowMarkup(saved)];
								});
							}
							// Edit: hx-get="/contact/N/edit" on the custom edit event, which the button's onClick sends, after
							// SweetAlert's confirmation (and the editing row's cancel event) when another row is being edited.
							const edit = () =>
								request(button, 'GET', `/contact/${id}/edit`, {}, () => {
									const contact = contacts.find((_, i) => i === id)!;
									return [editTemplate({ ...contact, id }), editMarkup(contact)];
								});
							const editing = document.querySelector('.editing');
							if (!editing) return edit();
							const swal = (window as unknown as { Swal: SweetAlert }).Swal;
							swal
								.fire({
									title: 'Already Editing',
									showCancelButton: true,
									confirmButtonText: 'Yep, Edit This Row!',
									text: 'Hey!  You are already editing a row!  Do you want to cancel that edit and continue?',
								})
								.then((result) => {
									if (!result.isConfirmed) return;
									// The editing row's cancel event: hx-get="/contact/N" on the row itself.
									cancel(editing, editing);
									edit();
								});
						}}
					>
						@for (const contact of CONTACTS; key contact.email) {
							<tr>
								<td>{contact.name}</td>
								<td>{contact.email}</td>
								<td>
									<button class="btn danger">{'\n          Edit\n        '}</button>
								</td>
							</tr>
						}
					</tbody>
				</table>
			</div>
			{" "}
			<script src={"https://cdn.jsdelivr.net/npm/sweetalert2@11"}></script>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
