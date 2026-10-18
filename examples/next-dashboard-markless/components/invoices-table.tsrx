import InvoiceStatus from './status.tsrx';
import { UpdateInvoice } from './invoice-buttons.tsrx';
import { deleteInvoice } from '../lib/forms.ts';
import { TrashIcon } from './icons/TrashIcon.tsrx';

type Row = { readonly id: string; readonly name: string; readonly email: string; readonly status: string; readonly amount: string; readonly date: string; readonly image: { readonly src: string; readonly srcset: string } };

export default function InvoicesTable({ invoices, onDeleted }: { readonly invoices: readonly Row[]; readonly onDeleted: () => void }) @{
	<div class="mt-6 flow-root">
		<div class="inline-block min-w-full align-middle">
			<div class="rounded-lg bg-gray-50 p-2 md:pt-0">
				<div class="md:hidden">
					@for (const invoice of invoices; key invoice.id) {
						<div class="mb-2 w-full rounded-md bg-white p-4">
							<div class="flex items-center justify-between border-b pb-4">
								<div>
									<div class="mb-2 flex items-center">
										<img alt={`${invoice.name}'s profile picture`} loading="lazy" width="28" height="28" decoding="async" class="mr-2 rounded-full" style="color:transparent" srcset={invoice.image.srcset} src={invoice.image.src} />
										<p>{invoice.name}</p>
									</div>
									<p class="text-sm text-gray-500">{invoice.email}</p>
								</div>
								<InvoiceStatus status={invoice.status} />
							</div>
							<div class="flex w-full items-center justify-between pt-4">
								<div>
									<p class="text-xl font-medium">{invoice.amount}</p>
									<p>{invoice.date}</p>
								</div>
								<div class="flex justify-end gap-2">
									<UpdateInvoice id={invoice.id} />
									<form
																		data-invoice={invoice.id}
										onSubmit={(event) => {
											event.preventDefault();
											void deleteInvoice((event.target as HTMLFormElement).dataset.invoice ?? '').then(() => onDeleted());
										}}
									>
										<button type="submit" class="rounded-md border p-2 hover:bg-gray-100">
											<span class="sr-only">Delete</span>
											<TrashIcon iconClass="w-5" />
										</button>
									</form>
								</div>
							</div>
						</div>
					}
				</div>
				<table class="hidden min-w-full text-gray-900 md:table">
					<thead class="rounded-lg text-left text-sm font-normal">
						<tr>
							<th scope="col" class="px-4 py-5 font-medium sm:pl-6">Customer</th>
							<th scope="col" class="px-3 py-5 font-medium">Email</th>
							<th scope="col" class="px-3 py-5 font-medium">Amount</th>
							<th scope="col" class="px-3 py-5 font-medium">Date</th>
							<th scope="col" class="px-3 py-5 font-medium">Status</th>
							<th scope="col" class="relative py-3 pl-6 pr-3"><span class="sr-only">Edit</span></th>
						</tr>
					</thead>
					<tbody class="bg-white">
						@for (const invoice of invoices; key invoice.id) {
							<tr class="w-full border-b py-3 text-sm last-of-type:border-none [&:first-child>td:first-child]:rounded-tl-lg [&:first-child>td:last-child]:rounded-tr-lg [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg">
								<td class="whitespace-nowrap py-3 pl-6 pr-3">
									<div class="flex items-center gap-3">
										<img alt={`${invoice.name}'s profile picture`} loading="lazy" width="28" height="28" decoding="async" class="rounded-full" style="color:transparent" srcset={invoice.image.srcset} src={invoice.image.src} />
										<p>{invoice.name}</p>
									</div>
								</td>
								<td class="whitespace-nowrap px-3 py-3">{invoice.email}</td>
								<td class="whitespace-nowrap px-3 py-3">{invoice.amount}</td>
								<td class="whitespace-nowrap px-3 py-3">{invoice.date}</td>
								<td class="whitespace-nowrap px-3 py-3"><InvoiceStatus status={invoice.status} /></td>
								<td class="whitespace-nowrap py-3 pl-6 pr-3">
									<div class="flex justify-end gap-3">
										<UpdateInvoice id={invoice.id} />
										<form
																		data-invoice={invoice.id}
										onSubmit={(event) => {
											event.preventDefault();
											void deleteInvoice((event.target as HTMLFormElement).dataset.invoice ?? '').then(() => onDeleted());
										}}
									>
										<button type="submit" class="rounded-md border p-2 hover:bg-gray-100">
											<span class="sr-only">Delete</span>
											<TrashIcon iconClass="w-5" />
										</button>
									</form>
									</div>
								</td>
							</tr>
						}
					</tbody>
				</table>
			</div>
		</div>
	</div>
}
