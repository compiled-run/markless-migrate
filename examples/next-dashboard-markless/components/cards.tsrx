import { BanknotesIcon } from './icons/BanknotesIcon.tsrx';
import { ClockIcon } from './icons/ClockIcon.tsrx';
import { InboxIcon } from './icons/InboxIcon.tsrx';
import { UserGroupIcon } from './icons/UserGroupIcon.tsrx';

export function Card({ title, value, type }: { readonly title: string; readonly value: string; readonly type: string }) @{
	<div class="rounded-xl bg-gray-50 p-2 shadow-sm">
		<div class="flex p-4">
			@switch (type) {
				@case 'collected': {
					<BanknotesIcon iconClass="h-5 w-5 text-gray-700" />
				}
				@case 'customers': {
					<UserGroupIcon iconClass="h-5 w-5 text-gray-700" />
				}
				@case 'pending': {
					<ClockIcon iconClass="h-5 w-5 text-gray-700" />
				}
				@default: {
					<InboxIcon iconClass="h-5 w-5 text-gray-700" />
				}
			}
			<h3 class="ml-2 text-sm font-medium">{title}</h3>
		</div>
		<p class="lusitana
          truncate rounded-xl bg-white px-4 py-8 text-center text-2xl">{value}</p>
	</div>
}
