import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Dashboard } from '../../../components/dashboard.tsrx';
import { ErrorComponent } from '../../../components/error.tsrx';
import { Shell } from '../../../components/shell.tsrx';
import { bindRequest } from '../../../lib/request.ts';
import { here, onServer, storedSandbox } from '../../../lib/where.ts';
import { Spinner } from '../../../components/spinner.tsrx';
import { BOUNCE } from '../../../lib/classes.ts';
import { fetchInvoices, postInvoice } from '../../../lib/data.ts';

export default function InvoicesIndex({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();
	// queryClient.invalidateQueries(): the list reads it, the mutation moves it.
	let version = state(0);
	let status = state<'idle' | 'pending' | 'success' | 'error'>('idle');
	const pending = computed(() => status === 'pending');
	const invoices = computed(async () => {
		const v = version;
		return fetchInvoices();
	});

	<Shell url={url} sandbox={sandbox}>
		<Dashboard url={url} />
		<div class="flex-1 flex">
			<div class="divide-y w-48">
				@try {
					@for (const invoice of invoices; key invoice.id) {
						<div>
							<a
								class="block py-2 px-3 text-blue-700"
								href={`/dashboard/invoices/${invoice.id}`}
							>
								<pre class="text-sm">
									{`#${invoice.id} - ${invoice.title.slice(0, 10)} `}
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
				<div class="p-2">
					<form
						method="dialog"
						class="space-y-2"
						onSubmit={async (event) => {
							event.preventDefault();
							event.stopPropagation();
							const formData = new FormData(event.target as HTMLFormElement);
							status = 'pending';
							try {
								await postInvoice({ title: formData.get('title') as string, body: formData.get('body') as string });
								version++;
								status = 'success';
							} catch {
								status = 'error';
							}
						}}
					>
						<div>Create a new Invoice:</div>
						<div class="space-y-2">
							<h2 class="font-bold text-lg">
								<input name="title" placeholder="Invoice Title" class="border border-opacity-50 rounded-sm p-2 w-full" />
							</h2>
							<div>
								<textarea name="body" rows="6" placeholder="Invoice Body..." class="border border-opacity-50 p-2 rounded-sm w-full"></textarea>
							</div>
						</div>
						<div>
							<button class="bg-blue-500 rounded-sm p-2 uppercase text-white font-black disabled:opacity-50" disabled={pending}>
								<span>{pending ? 'Creating ' : 'Create'}</span>
								<div class={pending ? 'inline-block animate-spin px-3 transition opacity-100 duration-500 delay-300' : 'inline-block px-3'} hidden={!pending}>⍥</div>
							</button>
						</div>
						@switch (status) {
							@case 'success': {
								<div class={`${BOUNCE} bg-green-500`}>Created!</div>
							}
							@case 'error': {
								<div class={`${BOUNCE} bg-red-500`}>Failed to create.</div>
							}
							@default: {
							}
						}
					</form>
				</div>
			</div>
		</div>
	</Shell>
}
