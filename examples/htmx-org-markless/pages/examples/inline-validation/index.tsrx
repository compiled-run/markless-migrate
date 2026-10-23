import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { INITIAL_CODE, validateEmail, type Entry } from '../../../components/inline-validation.ts';

export default function InlineValidation() @{
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	let checking = state(false);
	// The answer htmx last swapped in for the email div (hx-target="this" hx-swap="outerHTML"), once there is one.
	let answered = state(false);
	let invalid = state(false);
	let error = state('');
	const form = element<HTMLFormElement>();
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader starFrame />
		<main class="c content ">
			<h1>Inline Validation</h1>
			{" "}
			<p>{"This example shows how to do inline field validation, in this case of an email address. To do this we need to create a form with an input that "}<code>POST</code>s back to the server with the value to be validated and updates the DOM with the validation results.</p>
			{" "}
			<p>We start with this form:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">h3</span><span>&gt;Signup Form&lt;/</span><span style="color:#e06c75;">h3</span><span>{">\n"}</span><span>&lt;</span><span style="color:#e06c75;">{"form "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">"/contact"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"this\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Email Address&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"\"email\" "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/contact/email\" "}</span><span style="color:#d19a66;">hx-indicator</span><span>=</span><span style="color:#98c379;">"#ind"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"img "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"ind\" "}</span><span style="color:#d19a66;">src</span><span>=</span><span style="color:#98c379;">{"\"/img/bars.svg\" "}</span><span style="color:#d19a66;">alt</span><span>=</span><span style="color:#98c379;">{"\"Checking...\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"htmx-indicator"</span><span>{"/>\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"form-group"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;First Name&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"text\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"form-control\" "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"firstName"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"form-group"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Last Name&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">{"\"text\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">{"\"form-control\" "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"lastName"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"button "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn primary"</span><span>&gt;Submit&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">form</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"Note that the first div in the form has set itself as the target of the request and specified the "}<code>outerHTML</code>{" swap strategy, so it will be replaced entirely by the response. The input then specifies that it will "}<code>POST</code>{" to "}<code>/contact/email</code>{" for validation, when the "}<code>changed</code>{" event occurs (this is the default for inputs). It also specifies an indicator for the request."}</p>
			{" "}
			<p>When a request occurs, it will return a partial to replace the outer div. It might look like this:</p>
			{" "}
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">{"\"this\" "}</span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">{"\"outerHTML\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"error"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">label</span><span>&gt;Email Address&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"input "}</span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">{"\"email\" "}</span><span style="color:#d19a66;">hx-post</span><span>=</span><span style="color:#98c379;">{"\"/contact/email\" "}</span><span style="color:#d19a66;">hx-indicator</span><span>=</span><span style="color:#98c379;">{"\"#ind\" "}</span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"test&#64;foo.com"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"img "}</span><span style="color:#d19a66;">id</span><span>=</span><span style="color:#98c379;">{"\"ind\" "}</span><span style="color:#d19a66;">src</span><span>=</span><span style="color:#98c379;">{"\"/img/bars.svg\" "}</span><span style="color:#d19a66;">alt</span><span>=</span><span style="color:#98c379;">{"\"Checking...\" "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"htmx-indicator"</span><span>{"/>\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">{"div "}</span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">'error-message'</span><span>{">That email is already taken.  Please enter another email.</"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			{" "}
			<p>{"Note that this div is annotated with the "}<code>error</code>{" class and includes an error message element."}</p>
			{" "}
			<p>This form can be lightly styled with this CSS:</p>
			{" "}
			<pre data-lang="css" style="background-color:#1f2329;color:#abb2bf;" class="language-css "><code class="language-css" data-lang="css"><span>{"  "}</span><span style="color:#d19a66;">{".error-message "}</span><span>{"{\n"}</span><span>{"    color:red;\n"}</span><span>{"  }\n"}</span><span>{"  "}</span><span style="color:#d19a66;">{".error "}</span><span style="color:#e06c75;">{"input "}</span><span>{"{\n"}</span><span>{"      box-shadow: "}</span><span style="color:#d19a66;">{"0 0 3px "}</span><span style="color:#56b6c2;">#CC0000</span><span>{";\n"}</span><span>{"   }\n"}</span><span>{"  "}</span><span style="color:#d19a66;">{".valid "}</span><span style="color:#e06c75;">{"input "}</span><span>{"{\n"}</span><span>{"      box-shadow: "}</span><span style="color:#d19a66;">{"0 0 3px "}</span><span style="color:#56b6c2;">#36cc00</span><span>{";\n"}</span><span>{"   }\n"}</span></code></pre>
			{" "}
			<p>To give better visual feedback.</p>
			{" "}
			<p>{"Below is a working demo of this example. The only email that will be accepted is "}<code>test&#64;test.com</code>.</p>
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
										<pre class="language-html"><code class="language-html">{entry.code}</code>{entry.truncated ? '' : ' '}</pre>
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
			<h2><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">🔗</a>Demo</h2>
			{/* What the page's init("/demo") wrote into the canvas: its demoTemplate(). */}
			<div id="demo-canvas">
				<h3>Signup Form</h3>
				<p>Enter an email into the input below and on tab out it will be validated.  Only "test@test.com" will pass.</p>
				{' '}
				<form el={form}>
					{'\n  '}
					{/* The page's formTemplate() div until the first answer, then its emailInputTemplate(val, errorMsg): the label loses
					    its for and the input its id, and the input carries aria-invalid. */}
					<div class={answered ? (invalid ? 'error' : 'valid') : undefined}>
						{'\n    '}
						<label for={answered ? undefined : 'email'}>Email Address</label>
						{'\n    '}
						{/* hx-post="/contact/email" hx-indicator="#ind" on the default change trigger: htmx posts the enclosing form's
						    fields, #ind carries htmx-request until the fake server answers 80 ms later, and the answer replaces the div,
						    so the input that had focus loses it. */}
						<input
							name="email"
							id={answered ? undefined : 'email'}
							aria-invalid={answered ? String(invalid) : undefined}
							onChange={(event) => {
								const field = event.target as HTMLInputElement;
								if (!form) return;
								const fields = [...new FormData(form)].map(([name, value]) => [name, String(value)] as const);
								checking = true;
								setTimeout(() => {
									const { answer, entry } = validateEmail(log.length + 1, fields);
									checking = false;
									answered = true;
									invalid = answer.error !== '';
									error = answer.error;
									// The answer's input carries the value attribute.
									field.setAttribute('value', answer.email);
									field.value = answer.email;
									if (document.activeElement === field) field.blur();
									log = [entry, ...log];
									selected = entry.id;
								}, 80);
							}}
						/>
						{'\n    '}
						<img id="ind" src="/img/bars.svg" alt="Checking..." class={checking ? 'htmx-indicator htmx-request' : 'htmx-indicator'} />
						{'\n  '}
						@if (error) {
							<div class="error-message">{error}</div>;
						}
					</div>
					{'\n  '}
					<div class="form-group">
						{'\n    '}
						<label for="firstName">First Name</label>
						{'\n    '}
						<input type="text" class="form-control" name="firstName" id="firstName" />
						{'\n  '}
					</div>
					{'\n  '}
					<div class="form-group">
						{'\n    '}
						<label for="lastName">Last Name</label>
						{'\n    '}
						<input type="text" class="form-control" name="lastName" id="lastName" />
						{'\n  '}
					</div>
					{'\n  '}
					<button type="submit" class="btn primary" disabled="">Submit</button>
					{'\n'}
				</form>
			</div>
		</main>
		<SiteFooter />
	</div>
}
