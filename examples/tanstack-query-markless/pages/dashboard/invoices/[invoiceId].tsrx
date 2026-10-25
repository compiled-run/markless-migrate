import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Dashboard } from '../../../components/dashboard.tsrx';
import { ErrorComponent } from '../../../components/error.tsrx';
import { Shell } from '../../../components/shell.tsrx';
import { bindRequest } from '../../../lib/request.ts';
import { here, onServer, storedSandbox } from '../../../lib/where.ts';
import { Spinner } from '../../../components/spinner.tsrx';
import { linkClass } from '../../../lib/active.ts';
import { BOUNCE } from '../../../lib/classes.ts';
import { fetchInvoiceById, fetchInvoices, patchInvoice } from '../../../lib/data.ts';
import { parseSearch, stringifySearch } from '../../../lib/search.ts';

export default function InvoicePage({ url, params, http }: PageProps<{ invoiceId: string }>) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();
	// Read straight from the prop: a recipe that reads a state() seeded from a prop crashes when it runs again in the browser (repros/state-from-prop-recipe.tsrx).
	const id = Number(params.invoiceId);
	const search = parseSearch(here(url).search);
	let showNotes = state(search.showNotes === true);
	let notes = state(typeof search.notes === 'string' ? search.notes : '');
	// queryClient.invalidateQueries(): the list and the invoice read it, the mutation moves it.
	let version = state(0);
	let status = state<'idle' | 'pending' | 'success' | 'error'>('idle');
	const pending = computed(() => status === 'pending');
	// The active row is marked in the recipe: a row template that reads a page prop throws once the list changes in the browser (repros/async-row-reads-prop.tsrx).
	const invoices = computed(async () => {
		const v = version;
		const current = id;
		return (await fetchInvoices()).map((row) => ({ ...row, active: row.id === current }));
	});
	const invoice = computed(async () => {
		const v = version;
		const which = id;
		return fetchInvoiceById(which);
	});
	const notesHref = computed(() => `${here(url).pathname}${stringifySearch({ ...parseSearch(here(url).search), notes: notes || undefined, showNotes: showNotes ? undefined : true })}`);

	<Shell url={url} sandbox={sandbox}>
		<Dashboard url={url} />
		<div class="flex-1 flex">
			<div class="divide-y w-48">
				@try {
					@for (const row of invoices; key row.id) {
						<div>
							<a
								class={linkClass('block py-2 px-3 text-blue-700', row.active)}
								href={`/dashboard/invoices/${row.id}`}
								data-status={row.active ? 'active' : undefined}
								aria-current={row.active ? 'page' : undefined}
							>
								<pre class="text-sm">
									{`#${row.id} - ${row.title.slice(0, 10)} `}
									<div class="inline-block animate-spin px-3 transition duration-500 opacity-0 delay-0">⍥</div>
								</pre>
							</a>
						</div>
					}
				} @pending {
					<div class="p-2 text-2xl">
						<Spinner />
					</div>
				} @catch (error) {
					<ErrorComponent error={error} />
				}
			</div>
			<div class="flex-1 border-l">
				@try {
					<form
						method="dialog"
						class="p-2 space-y-2"
						onSubmit={async (event) => {
							event.preventDefault();
							event.stopPropagation();
							const formData = new FormData(event.target as HTMLFormElement);
							status = 'pending';
							try {
								await patchInvoice({ id, title: formData.get('title') as string, body: formData.get('body') as string });
								version++;
								status = 'success';
							} catch {
								status = 'error';
							}
						}}
					>
						<div class="space-y-2">
							<h2 class="font-bold text-lg">
								<input name="title" placeholder="Invoice Title" class="border border-opacity-50 rounded-sm p-2 w-full" value={invoice.title} disabled={pending} />
							</h2>
							<div>
								<textarea name="body" rows="6" placeholder="Invoice Body..." class="border border-opacity-50 p-2 rounded-sm w-full" disabled={pending}>
									{invoice.body}
								</textarea>
							</div>
						</div>
						<div>
							<a
								class="text-blue-700"
								href={notesHref}
								onClick={(event) => {
									event.preventDefault();
									showNotes = !showNotes;
									history.pushState(history.state, '', `${location.pathname}${stringifySearch({ ...parseSearch(location.search), showNotes: showNotes ? true : undefined })}`);
								}}
							>
								{showNotes ? 'Close Notes ' : 'Show Notes '}
							</a>
							<div hidden={!showNotes}>
								<div class="h-2"></div>
								<textarea
									rows="5"
									class="shadow-sm w-full p-2 rounded-sm"
									placeholder="Write some notes here..."
									onInput={(event) => {
										notes = (event.target as HTMLTextAreaElement).value;
										history.replaceState(history.state, '', `${location.pathname}${stringifySearch({ ...parseSearch(location.search), notes: notes ? notes : undefined })}`);
									}}
								>
									{notes}
								</textarea>
								<div class="italic text-xs">Notes are stored in the URL. Try copying the URL into a new tab!</div>
							</div>
						</div>
						<div>
							<button class="bg-blue-500 rounded-sm p-2 uppercase text-white font-black disabled:opacity-50" disabled={pending}>Save</button>
						</div>
						<div hidden={status !== 'success'}>
							<div class={`${BOUNCE} bg-green-500`}>Saved!</div>
						</div>
						<div hidden={status !== 'error'}>
							<div class={`${BOUNCE} bg-red-500`}>Failed to save.</div>
						</div>
					</form>
				} @pending {
					<div class="p-2 text-2xl">
						<Spinner />
					</div>
				} @catch (error) {
					<ErrorComponent error={error} />
				}
			</div>
		</div>
	</Shell>
}
