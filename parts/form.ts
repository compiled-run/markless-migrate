// A form the old page's script handled (submitting it left the page where it was) does not submit natively.
export function submit(target: Element, event: SubmitEvent): boolean {
	if (!target.matches('form[data-mm-form]') || target.closest('[data-mm-fl]')) return false;
	event.preventDefault();
	// Unclaimed: a library port of the same form (a questionnaire's) still answers its submit.
	return false;
}
