// A form the old page's script handled (submitting it left the page where it was) does not submit natively.
export function submit(target: Element, event: SubmitEvent): boolean {
	if (!target.matches('form[data-mm-form]')) return false;
	event.preventDefault();
	return true;
}
