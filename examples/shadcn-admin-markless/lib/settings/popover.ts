// Radix Popover's DismissableLayer listens for Escape on the whole document: focus may have left the content (a
// native select in the calendar caption) and Escape still closes it. Presses inside the content are its own.
export function escapeCloses(contentId: string, close: () => void): void {
	const listener = (event: KeyboardEvent) => {
		const content = document.getElementById(contentId);
		if (!content || content.closest('[hidden]')) {
			document.removeEventListener('keydown', listener, true);
			return;
		}
		if (event.key !== 'Escape' || (event.target instanceof Node && content.contains(event.target))) return;
		document.removeEventListener('keydown', listener, true);
		close();
	};
	document.addEventListener('keydown', listener, true);
}
