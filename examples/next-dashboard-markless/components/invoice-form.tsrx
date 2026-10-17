import { computed, state } from '@markless/core';
import { Button } from './button.tsrx';
import { CheckIcon } from './icons/CheckIcon.tsrx';
import { ClockIcon } from './icons/ClockIcon.tsrx';
import { CurrencyDollarIcon } from './icons/CurrencyDollarIcon.tsrx';
import { UserCircleIcon } from './icons/UserCircleIcon.tsrx';
import { go, post } from '../lib/forms.ts';

type Customer = { readonly id: string; readonly name: string };
type Result = { errors?: { customerId?: string[]; amount?: string[]; status?: string[] }; message?: string | null; redirect?: string };

// The create and edit forms differ only in their action, initial values, labels and two class lists.
export default function InvoiceForm({ action, customers, customerId, amount, status, submitLabel, edit }: { readonly action: string; readonly customers: readonly Customer[]; readonly customerId: string; readonly amount: string; readonly status: string; readonly submitLabel: string; readonly edit: boolean }) @{
	let customerError = state('');
	let amountError = state('');
	let statusError = state('');
	let message = state('');
	const pendingClass = computed(() => (edit ? 'h-4 w-4 border-gray-300 bg-gray-100 text-gray-600 focus:ring-2' : 'text-white-600 h-4 w-4 cursor-pointer border-gray-300 bg-gray-100 focus:ring-2'));
	const paidClass = computed(() => (edit ? 'h-4 w-4 border-gray-300 bg-gray-100 text-gray-600 focus:ring-2' : 'h-4 w-4 cursor-pointer border-gray-300 bg-gray-100 text-gray-600 focus:ring-2'));
	<form
		action="javascript:void 0"
		data-action={action}
		onSubmit={(event) => {
			event.preventDefault();
			const form = event.target as HTMLFormElement;
			void post<Result>(form.dataset.action ?? '', form).then((next) => {
				if (next.redirect) return go(next.redirect);
				form.reset();
				customerError = next.errors?.customerId?.[0] ?? '';
				amountError = next.errors?.amount?.[0] ?? '';
				statusError = next.errors?.status?.[0] ?? '';
				message = next.message ?? '';
			});
		}}
	>
		<div class="rounded-md bg-gray-50 p-4 md:p-6">
			<div class="mb-4">
				<label for="customer" class="mb-2 block text-sm font-medium">Choose customer</label>
				<div class="relative">
					<select id="customer" name="customerId" class="peer block w-full cursor-pointer rounded-md border border-gray-200 py-2 pl-10 text-sm outline-2 placeholder:text-gray-500" aria-describedby="customer-error">
						<option value="" disabled selected={customerId === ''}>Select a customer</option>
						@for (const customer of customers; key customer.id) {
							<option value={customer.id} selected={customer.id === customerId}>{customer.name}</option>
						}
					</select>
					<UserCircleIcon iconClass="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500" />
				</div>
				<div id="customer-error" aria-live="polite" aria-atomic="true">
					<p class={customerError ? 'mt-2 text-sm text-red-500' : 'hidden'}>{customerError}</p>
				</div>
			</div>
			<div class="mb-4">
				<label for="amount" class="mb-2 block text-sm font-medium">Choose an amount</label>
				<div class="relative mt-2 rounded-md">
					<div class="relative">
						<input id="amount" name="amount" type="number" value={amount} step="0.01" placeholder="Enter USD amount" class="peer block w-full rounded-md border border-gray-200 py-2 pl-10 text-sm outline-2 placeholder:text-gray-500" aria-describedby="amount-error" />
						<CurrencyDollarIcon iconClass="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
					</div>
				</div>
				<div id="amount-error" aria-live="polite" aria-atomic="true">
					<p class={amountError ? 'mt-2 text-sm text-red-500' : 'hidden'}>{amountError}</p>
				</div>
			</div>
			<fieldset>
				<legend class="mb-2 block text-sm font-medium">Set the invoice status</legend>
				<div class="rounded-md border border-gray-200 bg-white px-[14px] py-3">
					<div class="flex gap-4">
						<div class="flex items-center">
							<input id="pending" name="status" type="radio" value="pending" checked={status === 'pending'} class={pendingClass} />
							<label for="pending" class="ml-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
								Pending <ClockIcon iconClass="h-4 w-4" />
							</label>
						</div>
						<div class="flex items-center">
							<input id="paid" name="status" type="radio" value="paid" checked={status === 'paid'} class={paidClass} />
							<label for="paid" class="ml-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-green-500 px-3 py-1.5 text-xs font-medium text-white">
								Paid <CheckIcon iconClass="h-4 w-4" />
							</label>
						</div>
					</div>
				</div>
				<div id="status-error" aria-live="polite" aria-atomic="true">
					<p class={statusError ? 'mt-2 text-sm text-red-500' : 'hidden'}>{statusError}</p>
				</div>
			</fieldset>
			<div aria-live="polite" aria-atomic="true">
				<p class={edit ? 'my-2 text-sm text-red-500' : 'mt-2 text-sm text-red-500'} hidden={!message}>{message}</p>
			</div>
		</div>
		<div class="mt-6 flex justify-end gap-4">
			<a href="/dashboard/invoices" class="flex h-10 items-center rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200">Cancel</a>
			<Button extraClass="">{submitLabel}</Button>
		</div>
	</form>
}
