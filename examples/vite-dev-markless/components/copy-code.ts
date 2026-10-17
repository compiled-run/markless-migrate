const timeouts = new WeakMap<Element, number>();

// VitePress's copy-code: copies the block's text without shell prompts, then flags the button for two seconds.
export async function copyCode(target: EventTarget | null): Promise<void> {
	if (!(target instanceof HTMLElement) || !target.matches('div[class*="language-"] > button.copy')) return;
	const parent = target.parentElement;
	const sibling = target.nextElementSibling?.nextElementSibling;
	if (!parent || !sibling) return;
	const clone = sibling.cloneNode(true) as Element;
	for (const node of clone.querySelectorAll('.vp-copy-ignore, .diff.remove')) node.remove();
	clone.innerHTML = clone.innerHTML.replace(/\n+/g, '\n');
	let text = clone.textContent || '';
	const lang = /language-(\w+)/.exec(parent.className)?.[1] || '';
	if (/^(?:sh|bash|zsh|fish|shell|shellscript|shellsession|console|ps1|powershell|pwsh)$/.test(lang)) text = text.replace(/^ *(\$|>) /gm, '').trim();
	await navigator.clipboard.writeText(text).catch(() => undefined);
	target.classList.add('copied');
	clearTimeout(timeouts.get(target));
	timeouts.set(
		target,
		window.setTimeout(() => {
			target.classList.remove('copied');
			target.blur();
			timeouts.delete(target);
		}, 2000),
	);
}

/** The install tab a change event selected: CodeGroup.vue's inputs are `tab-<group>-<index>`. */
export const tabIndex = (target: EventTarget | null): number => Number((target as HTMLInputElement).id.split('-').pop());
