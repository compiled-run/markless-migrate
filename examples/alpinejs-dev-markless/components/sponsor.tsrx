export default function Sponsor({ wrapper, label }: { readonly wrapper: string; readonly label: string }) @{
	<div class={wrapper}>
		<span class={label}>{' Ecosystem sponsor '}</span>
		<a href="https://neon.com" target="_blank" rel="noopener" class="group block rounded-lg border border-gray-200 bg-[#F4FAF7] p-4 transition hover:border-gray-300 hover:bg-[#EDF8F3]">
			<img src="/images/sponsors/neon-light.svg" alt="Neon" class="h-8 w-auto" />
			<p class="mt-3 text-xs leading-5 text-gray-600">{' Neon is a complete backend built around Lakebase Postgres, for developers, startups, and agent platforms, by Databricks. '}</p>
			{' '}
			<span class="mt-3 inline-block text-xs font-semibold text-gray-900 group-hover:text-cyan-600 transition-colors">{' neon.com → '}</span>
			{' '}
		</a>
	</div>
}
