/** TanStack Router's navigate(): an in-page navigation, here through the Markless router by following a link to the path. */
export function navigate(path: string): void {
	const link = document.createElement('a');
	link.href = path;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
}
