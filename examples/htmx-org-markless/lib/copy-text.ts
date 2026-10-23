// The REST copypasta page's Copy buttons, as their hyperscript runs them:
//   on click
//     get the innerText of the previous <div/>
//     [get result.split('\n').map( \ l -> '  ' + l ).join('\n')]   (Copy For HN: HN's code-block indent)
//     then writeText(the result) with the navigator's clipboard
//     put '<message>' into the next <output/>
//     wait 2s
//     put '' into the next <output/>
// `previous` and `next` search the whole document before and after the button, as hyperscript's do. A click while the
// handler runs waits for it, the last one only (hyperscript's default `queue last`).

const running = new WeakMap<Element, { again: boolean }>();

function previous(from: Element, tag: string): HTMLElement | undefined {
	const all = [...document.getElementsByTagName(tag)];
	return all.reverse().find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) as HTMLElement | undefined;
}

function next(from: Element, tag: string): HTMLElement | undefined {
	return [...document.getElementsByTagName(tag)].find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) as
		| HTMLElement
		| undefined;
}

async function copyOnce(button: Element, indent: boolean, message: string): Promise<void> {
	let text = previous(button, 'div')?.innerText ?? '';
	if (indent) text = text.split('\n').map((l) => `  ${l}`).join('\n');
	await navigator.clipboard.writeText(text);
	const output = next(button, 'output');
	if (output) output.innerHTML = message;
	await new Promise((resolve) => setTimeout(resolve, 2000));
	const after = next(button, 'output');
	if (after) after.innerHTML = '';
}

export async function copyPrevious(event: Event, indent: boolean, message: string): Promise<void> {
	const button = (event.target as Element | null)?.closest('button');
	if (!button) return;
	const run = running.get(button);
	if (run) {
		run.again = true;
		return;
	}
	const state = { again: true };
	running.set(button, state);
	try {
		while (state.again) {
			state.again = false;
			await copyOnce(button, indent, message);
		}
	} finally {
		running.delete(button);
	}
}
