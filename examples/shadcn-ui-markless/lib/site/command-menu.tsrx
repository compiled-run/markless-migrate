import { computed, state } from '@markless/core';
import { searchDocs, settleTyping } from './docs-search.ts';

// components/command-menu.tsx's Command: the docs search palette's input and list, with the Search Results group its
// SearchResults renders from /api/search. The groups the old page rendered for every search come from `fill`, the file
// the converter serves them in; the cmdk part filters, sorts and selects every item, and hides the group while it has none.
export default function CommandMenu({ fill }: { readonly fill: string }) @{
	let search = state('');
	const results = computed(async () => {
		const query = search;
		return searchDocs(query);
	});

	<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden text-popover-foreground rounded-none bg-transparent **:data-[slot=command-input]:h-9! **:data-[slot=command-input]:py-0 **:data-[slot=command-input-wrapper]:mb-0 **:data-[slot=command-input-wrapper]:h-9! **:data-[slot=command-input-wrapper]:rounded-md **:data-[slot=command-input-wrapper]:border **:data-[slot=command-input-wrapper]:border-input **:data-[slot=command-input-wrapper]:bg-input/50" cmdk-root="">
		<label cmdk-label="" for="command-menu-input" id="command-menu-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
		<div class="relative">
			<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
				<input
					data-slot="command-input"
					class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
					placeholder="Search documentation..."
					cmdk-input=""
					autocomplete="off"
					autocorrect="off"
					spellcheck="false"
					aria-autocomplete="list"
					role="combobox"
					aria-expanded="true"
					aria-controls="command-menu-list"
					aria-labelledby="command-menu-label"
					id="command-menu-input"
					type="text"
					value=""
					onInput={(event) => settleTyping(event.target)}
					onSearchsettle={(event) => (search = (event.target as HTMLInputElement).value)}
				/>
			</div>
		</div>
		<div data-slot="command-list" class="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto no-scrollbar min-h-80 scroll-pt-2 scroll-pb-1.5" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="command-menu-list">
			<div cmdk-list-sizer="">
				<div data-mm-layer-fill={fill} style="display: contents"></div>
				@try {
					<div data-slot="command-group" class="overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground px-0! **:[[cmdk-group-heading]]:scroll-mt-16 **:[[cmdk-group-heading]]:p-3! **:[[cmdk-group-heading]]:pb-1!" cmdk-group="" role="presentation" data-value="Search Results" hidden>
						<div cmdk-group-heading="" aria-hidden="true" id="command-menu-search-results">Search Results</div>
						<div cmdk-group-items="" role="group" aria-labelledby="command-menu-search-results">
							@for (const item of results; key item.id) {
								<div
									data-slot="command-item"
									class="relative flex cursor-default items-center gap-2 px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground h-9 rounded-md border border-transparent px-3! font-normal data-[selected=true]:border-input data-[selected=true]:bg-input/50"
									data-type={item.type}
									id={`command-menu-result-${item.id}`}
									cmdk-item=""
									role="option"
									aria-disabled="false"
									aria-selected="false"
									data-disabled="false"
									data-selected="false"
									data-value={`${item.content} ${item.type}`.trim()}
									data-mm-href={item.url}
								>
									<div class="line-clamp-1 text-sm">{item.content}</div>
								</div>
							}
						</div>
					</div>
				} @catch {
				}
			</div>
		</div>
	</div>
}
