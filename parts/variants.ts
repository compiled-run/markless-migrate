// Shows the value a page's marked elements take (convert's VariantPlan writes each as an @switch on a state their
// parent holds): the value is sent to each holder as an event, and Markless renders the arm. No node is written here.
export function showVariant(name: string, value: string): void {
	for (const holder of document.querySelectorAll(`[data-mm-variant-holder="${CSS.escape(name)}"]`)) holder.dispatchEvent(new CustomEvent('mmvariant', { detail: value }));
}
