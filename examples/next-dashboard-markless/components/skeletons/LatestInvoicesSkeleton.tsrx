import { InvoiceSkeleton } from './InvoiceSkeleton.tsrx';

export function LatestInvoicesSkeleton() @{
<div class="before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent relative flex w-full flex-col overflow-hidden md:col-span-4"
    >
      <div class="mb-4 h-8 w-36 rounded-md bg-gray-100"></div>
      <div class="flex grow flex-col justify-between rounded-xl bg-gray-100 p-4">
        <div class="bg-white px-6">
          <InvoiceSkeleton />
          <InvoiceSkeleton />
          <InvoiceSkeleton />
          <InvoiceSkeleton />
          <InvoiceSkeleton />
        </div>
        <div class="flex items-center pb-2 pt-6">
          <div class="h-5 w-5 rounded-full bg-gray-200"></div>
          <div class="ml-2 h-4 w-20 rounded-md bg-gray-200"></div>
        </div>
      </div>
    </div>
}
