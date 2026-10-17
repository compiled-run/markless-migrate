import { FaceFrownIcon } from './icons/FaceFrownIcon.tsrx';

export default function InvoiceNotFound() @{
	<main class="flex h-full flex-col items-center justify-center gap-2">
		<FaceFrownIcon iconClass="w-10 text-gray-400" />
		<h2 class="text-xl font-semibold">404 Not Found</h2>
		<p>Could not find the requested invoice.</p>
		<a href="/dashboard/invoices" class="mt-4 rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-400">Go Back</a>
	</main>
}
