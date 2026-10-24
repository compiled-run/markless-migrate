import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { CONTACTS, editTemplate, INITIAL_CODE, pushEntry, responseHtml, rowTemplate, showEntry, type Row } from '../../../components/edit-row.ts';

interface SweetAlert {
	fire(options: Record<string, unknown>): Promise<{ readonly isConfirmed: boolean }>;
}

export default function EditRow() @{
	// The contacts as the fake server holds them, each with whether htmx has swapped its row to the edit form, and the
	// elements whose request is in flight (htmx-request): "edit-N", "cancel-N" and "save-N" for a row's buttons, "row-N"
	// for its cancel event.
	let rows = state<readonly Row[]>(CONTACTS.map((contact, id) => ({ ...contact, id, editing: false })));
	let requesting = state<readonly string[]>([]);
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
					<tbody el={body}>
						@for (const row of rows; key row.id) {
							@if (row.editing) {
								{/* editTemplate(): its inputs' tags are not closed, so the browser read `<` and `td` as attributes (`<` cannot be given). */}
								<tr class={requesting.includes(`row-${row.id}`) ? 'editing htmx-request' : 'editing'}>
									<td><input autofocus="" name="name" value={row.name} td="" /></td>
									<td><input name="email" value={row.email} td="" /></td>
									<td>
										{/* hx-get="/contact/N": the row as it was. */}
										<button
											class={requesting.includes(`cancel-${row.id}`) ? 'btn danger htmx-request' : 'btn danger'}
											onClick={() => {
												const contact = row;
												const key = `cancel-${contact.id}`;
												if (requesting.includes(key)) return;
												requesting = [...requesting, key];
												setTimeout(() => {
													requesting = requesting.filter((r) => r !== key);
													requests = requests + 1;
													if (timeline && current) pushEntry(timeline, current, `GET /contact/${contact.id}`, `req-${requests}`, responseHtml('GET', `/contact/${contact.id}`, {}, rowTemplate(contact)));
													rows = rows.map((r) => (r.id === contact.id ? { ...r, editing: false } : r));
												}, 80);
											}}
										>
											{'\n          Cancel\n        '}
										</button>
										{' '}
										{/* hx-put="/contact/N" with hx-include="closest tr": the server keeps the row's inputs and answers with the row. */}
										<button
											class={requesting.includes(`save-${row.id}`) ? 'btn danger htmx-request' : 'btn danger'}
											onClick={(event) => {
												const contact = row;
												const key = `save-${contact.id}`;
												if (requesting.includes(key)) return;
												const inputs = (event.target as Element).closest('tr')!.querySelectorAll('input');
												const saved = { name: inputs[0]!.value, email: inputs[1]!.value };
												requesting = [...requesting, key];
												setTimeout(() => {
													requesting = requesting.filter((r) => r !== key);
													requests = requests + 1;
													if (timeline && current) pushEntry(timeline, current, `PUT /contact/${contact.id}`, `req-${requests}`, responseHtml('PUT', `/contact/${contact.id}`, saved, rowTemplate({ ...contact, ...saved })));
													rows = rows.map((r) => (r.id === contact.id ? { ...r, ...saved, editing: false } : r));
												}, 80);
											}}
										>
											{'\n          Save\n        '}
										</button>
									</td>
								</tr>
							} @else {
								<tr>
									<td>{row.name}</td>
									<td>{row.email}</td>
									<td>
										{/* hx-get="/contact/N/edit" on the custom edit event, which the button's onClick sends, after SweetAlert's
										    confirmation (and the editing row's cancel event) when another row is being edited. */}
										<button
											class={requesting.includes(`edit-${row.id}`) ? 'btn danger htmx-request' : 'btn danger'}
											onClick={() => {
												const id = row.id;
												const edit = () => {
													const key = `edit-${id}`;
													if (requesting.includes(key)) return;
													requesting = [...requesting, key];
													setTimeout(() => {
														requesting = requesting.filter((r) => r !== key);
														requests = requests + 1;
														const contact = rows.find((r) => r.id === id)!;
														if (timeline && current) pushEntry(timeline, current, `GET /contact/${id}/edit`, `req-${requests}`, responseHtml('GET', `/contact/${id}/edit`, {}, editTemplate(contact)));
														rows = rows.map((r) => (r.id === id ? { ...r, editing: true } : r));
														// htmx focuses the swapped-in row's autofocus input.
														requestAnimationFrame(() => body?.children[id]?.querySelector<HTMLInputElement>('input[autofocus]')?.focus());
													}, 80);
												};
												// The row document.querySelector('.editing') finds.
												const other = rows.find((r) => r.editing);
												if (!other) return edit();
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
														// The editing row's cancel event: hx-get="/contact/N" on the row.
														const key = `row-${other.id}`;
														requesting = [...requesting, key];
														setTimeout(() => {
															requesting = requesting.filter((r) => r !== key);
															requests = requests + 1;
															const contact = rows.find((r) => r.id === other.id)!;
															if (timeline && current) pushEntry(timeline, current, `GET /contact/${other.id}`, `req-${requests}`, responseHtml('GET', `/contact/${other.id}`, {}, rowTemplate(contact)));
															rows = rows.map((r) => (r.id === other.id ? { ...r, editing: false } : r));
														}, 80);
														edit();
													});
											}}
										>
											{'\n          Edit\n        '}
										</button>
									</td>
								</tr>
							}
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
