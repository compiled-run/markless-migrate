// DocSearch renders its own button into a hidden holder outside the Markless tree (an element it inserted here would shift every element Markless resumes by DOM position); the page's DocSearch script opens it from this button with DocSearch's own Cmd/Ctrl+K shortcut, on the click itself.
export default function SearchButton() @{
	<button type="button" aria-label="Search (Command+K)" class="DocSearch DocSearch-Button">
		<span class="DocSearch-Button-Container">
			<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" class="DocSearch-Search-Icon">
				<path d="M14.386 14.386l4.0877 4.0877-4.0877-4.0877c-2.9418 2.9419-7.7115 2.9419-10.6533 0-2.9419-2.9418-2.9419-7.7115 0-10.6533 2.9418-2.9419 7.7115-2.9419 10.6533 0 2.9419 2.9418 2.9419 7.7115 0 10.6533z" stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"></path>
			</svg>
			<span class="DocSearch-Button-Placeholder">Search</span>
		</span>
		<span class="DocSearch-Button-Keys">
			<kbd class="DocSearch-Button-Key">⌘</kbd>
			<kbd class="DocSearch-Button-Key">K</kbd>
		</span>
	</button>
}
