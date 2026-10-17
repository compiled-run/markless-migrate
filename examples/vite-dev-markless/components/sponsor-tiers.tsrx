import { computed } from '@markless/core';
import { loadSponsorTiers } from './sponsor-tiers.ts';

export default function SponsorTiers() @{
	const tiers = computed(async () => await loadSponsorTiers());

	<div data-v-755ff878="" class="wrapper">
		@try {
			@for (const tier of tiers; key tier.tier) {
				<div data-v-755ff878="" class="border-t border-nickel">
					<div data-v-755ff878="" class="py-5 px-5 sm:px-10 border-b border-nickel">
						<span data-v-755ff878="" class="text-white/70 text-xs font-mono uppercase tracking-wide">{tier.tier}</span>
					</div>
					<div data-v-755ff878="" class={tier.gridClass}>
						@for (const sponsor of tier.items; key sponsor.url) {
							<a data-v-755ff878="" href={sponsor.url} target="_blank" rel="noopener noreferrer" class={sponsor.linkClass}>
								<img data-v-755ff878="" src={sponsor.img} alt={sponsor.name} class={sponsor.logoClass} />
								<span data-v-755ff878="" class="spsr-name ml-5">{sponsor.name}</span>
							</a>;
						}
						@for (const cell of tier.empty; key cell.key) {
							<div data-v-755ff878="" class={cell.emptyClass} aria-hidden="true"></div>;
						}
					</div>
				</div>;
			}
		} @catch {
		}
	</div>
}
