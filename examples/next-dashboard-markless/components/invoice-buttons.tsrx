import { PencilIcon } from './icons/PencilIcon.tsrx';
import { PlusIcon } from './icons/PlusIcon.tsrx';

export function CreateInvoice() @{
	<a href="/dashboard/invoices/create" class="flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
		<span class="hidden md:block">Create Invoice</span>{' '}
		<PlusIcon iconClass="h-5 md:ml-4" />
	</a>
}

export function UpdateInvoice({ id }: { readonly id: string }) @{
	<a href={`/dashboard/invoices/${id}/edit`} class="rounded-md border p-2 hover:bg-gray-100">
		<PencilIcon iconClass="w-5" />
	</a>
}
