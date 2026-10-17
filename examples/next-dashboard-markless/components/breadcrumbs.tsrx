export default function Breadcrumbs({ label, href }: { readonly label: string; readonly href: string }) @{
	<nav aria-label="Breadcrumb" class="mb-6 block">
		<ol class="lusitana flex text-xl md:text-2xl">
			<li class="text-gray-500">
				<a href="/dashboard/invoices">Invoices</a>
				<span class="mx-3 inline-block">/</span>
			</li>
			<li aria-current="true" class="text-gray-900">
				<a href={href}>{label}</a>
			</li>
		</ol>
	</nav>
}
