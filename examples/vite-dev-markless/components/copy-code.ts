const timeouts = new WeakMap<Element, number>();

// VitePress's copyToClipboard: without clipboard access it copies through a hidden textarea and gives focus back.
async function copyToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		const element = document.createElement('textarea');
		const previouslyFocused = document.activeElement as HTMLElement | null;
		element.value = text;
		element.setAttribute('readonly', '');
		element.style.contain = 'strict';
		element.style.position = 'absolute';
		element.style.left = '-9999px';
		element.style.fontSize = '12pt';
		const selection = document.getSelection();
		const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
		document.body.appendChild(element);
		element.select();
		element.selectionStart = 0;
		element.selectionEnd = text.length;
		document.execCommand('copy');
		document.body.removeChild(element);
		if (originalRange) {
			selection!.removeAllRanges();
			selection!.addRange(originalRange);
		}
		previouslyFocused?.focus();
	}
}

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
	await copyToClipboard(text);
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
