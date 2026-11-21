// Shows the value a page's marked elements take (convert's VariantPlan writes each as an @switch on a state their
// parent holds): the value is sent to each holder as an event, and Markless renders the arm. No node is written here.
const shown = new Map<string, string>();

/** `initial` is the value the page loaded with: that value, or the one already shown, sends nothing and runs nothing. */
export function showVariant(name: string, value: string, initial: string): void {
	if ((shown.get(name) ?? initial) === value) return;
	shown.set(name, value);
	for (const holder of document.querySelectorAll(`[data-mm-variant-holder="${CSS.escape(name)}"]`)) holder.dispatchEvent(new CustomEvent('mmvariant', { detail: value }));
}
