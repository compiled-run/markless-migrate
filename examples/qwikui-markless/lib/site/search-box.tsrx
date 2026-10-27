import { state } from '@markless/core';
import { close } from '../parts/qwik-ui/modal.ts';
import { highlightedLink, latestSearch, type Hit } from './pagefind-search.ts';

// search.tsx's Search: an inline Qwik UI Combobox (filter off) in the header's search dialog. Each input searches
// Pagefind; the list shows "Headless" and up to 8 results, each a link to its best heading, or "No results found" when
// Pagefind found nothing for typed text. The first result is highlighted; Up and Down move the highlight, a pointer over a
// result highlights it, Enter goes to the highlighted result and closes the dialog, as a click on a result does.
// Each excerpt stretch is one <span> (text, then its marked words): Markless drops a branch, or all but the first node of
// a fragment, in a row of a list nested in a list the server rendered empty (examples/qwikui-markless/repros).
const ITEM = 'qwikui-search';

export default function SearchBox() @{
	let term = state('');
	let active = state(0);
	let hits = state<readonly (Hit & { readonly i: number })[]>([]);
	let none = state(false);

	<div role="group" aria-invalid="false" class="flex h-full flex-col overflow-hidden bg-popover text-popover-foreground w-full">
		<input
			role="combobox"
			value=""
			id={`${ITEM}-input`}
			aria-activedescendant={term ? `${ITEM}-${active}` : ''}
			aria-controls={`${ITEM}-inline`}
			aria-autocomplete="list"
			autocomplete="off"
			placeholder="Find anything"
			data-id="search"
			class="rounded-base flex border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 h-12 w-full rounded-b-none border-none focus-visible:ring-0 focus-visible:outline-hidden"
			onInput={(event) => {
				const typed = (event.target as HTMLInputElement).value;
				term = typed;
				active = 0;
				void latestSearch(typed).then((found) => {
					if (!found) return;
					hits = found.hits.map((hit, i) => ({ ...hit, i }));
					none = found.none;
				});
			}}
			onKeyDown={(event) => {
				const input = event.target as HTMLInputElement;
				const count = document.querySelectorAll(`[id^="${ITEM}-"][role="option"]`).length;
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
				if (event.key === 'ArrowDown' && active < count - 1) active = active + 1;
				if (event.key === 'ArrowUp' && active > 0) active = active - 1;
				if (event.key === 'Home') active = 0;
				if (event.key === 'End' && count) active = count - 1;
				if (event.key === 'Enter') {
					const link = highlightedLink(input);
					const dialog = input.closest('dialog');
					if (dialog) close(dialog);
					if (link) location.href = link.href;
				}
			}}
		/>
		<div id={`${ITEM}-inline`} role="listbox" class="max-h-[calc(100vh-200px)] overflow-auto border-t-2 border-border">
			<div class="px-2 py-2 font-medium text-muted-foreground" hidden={hits.length === 0}>Headless</div>
			<div style="display: contents">
					@for (const hit of hits; key hit.url) {
						<a
							href={hit.url}
							onClick={(event) => {
								const dialog = (event.target as Element).closest('dialog');
								if (dialog) close(dialog);
							}}
						>
							<div
								role="option"
								tabindex="-1"
								id={`${ITEM}-${hit.i}`}
								aria-selected="false"
								aria-disabled="false"
								data-highlighted={hit.i === active ? '' : undefined}
								data-item=""
								aria-labelledby={`${ITEM}-${hit.i}-item-label`}
								class="group justify-between gap-4 text-foreground aria-disabled:font-light aria-disabled:text-muted-foreground data-highlighted:cursor-pointer data-highlighted:bg-accent block rounded-none border-b px-2 py-4"
								onPointerOver={() => (active = hit.i)}
							>
								<div class="flex flex-col gap-1">
									<div class="text-sm text-muted-foreground capitalize opacity-50">{hit.section}</div>
									<span tabindex="-1" id={`${ITEM}-${hit.i}-item-label`} class="text-base font-medium">{hit.heading}</span>
									<div class="text-sm text-muted-foreground">
										@for (const run of hit.excerpt; key run.k) {
											<span>{run.text}<mark hidden={run.mark === ''}>{run.mark}</mark></span>
										}
									</div>
								</div>
							</div>
						</a>
					}
			</div>
			<div data-qui-combobox-empty="" data-empty="" class="px-2 py-4" hidden={!(none && term.length > 0)}>No results found</div>
		</div>
	</div>
}
