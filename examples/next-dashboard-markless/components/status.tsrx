import { CheckIcon } from './icons/CheckIcon.tsrx';
import { ClockIcon } from './icons/ClockIcon.tsrx';

const classFor = (status: string) => `inline-flex items-center rounded-full px-2 py-1 text-xs${status === 'pending' ? ' bg-gray-100 text-gray-500' : ''}${status === 'paid' ? ' bg-green-500 text-white' : ''}`;

export default function InvoiceStatus({ status }: { readonly status: string }) @{
	<span class={classFor(status)}>
		@switch (status) {
			@case 'pending': {
				<>Pending<ClockIcon iconClass="ml-1 w-4 text-gray-500" /></>
			}
			@case 'paid': {
				<>Paid<CheckIcon iconClass="ml-1 w-4 text-white" /></>
			}
		}
	</span>
}
