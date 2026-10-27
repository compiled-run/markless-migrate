import type { Part } from '../parts/index.ts';
import { close, show } from '../parts/qwik-ui/modal.ts';

// The docs pages' example components (apps/website/src/routes/docs/**/examples), each control found by the handler it ran
// on the old page (data-mm-qwik). Library behaviour comes from the ports in ../parts.
const on = (event: string, handler: string) => `[data-mm-qwik~="${event}:${handler}"]`;
// A Modal.Root renders a <div> around its dialog.
const dialogAfter = (el: Element) => el.nextElementSibling?.querySelector<HTMLDialogElement>(':scope > dialog[id$="-root"]');

// headless modal programmatic.tsx: a button outside the Modal sets its bind:show signal; styled modal hero.tsx and sheet.tsx:
// Save sets it false.
const modalDemos: Part = {
	click(target) {
		const opener = target.closest(on('click', 'programmatic.tsx_programmatic_component_Fragment_button_onClick'));
		const dialog = opener && dialogAfter(opener);
		if (dialog) {
			show(dialog);
			return true;
		}
		const save = target.closest(`${on('click', 'hero.tsx_hero_component_footer_Button_onClick')}, ${on('click', 'sheet.tsx_Sheet_component_footer_Button_onClick')}`);
		const owner = save?.closest('dialog');
		if (!owner) return false;
		close(owner);
		return true;
	},
};

// A Qwik UI Progress.Root and its indicator as progress-root.tsx and progress-indicator.tsx render them for value, min
// and max. The server repeats the props it was given (value, min, max) on the root; Qwik's re-render keeps only value.
function setProgress(root: Element, next: { value?: number; min?: number; max?: number }): void {
	const min = next.min ?? Number(root.getAttribute('aria-valuemin') ?? 0);
	const max = next.max ?? Number(root.getAttribute('aria-valuemax') ?? 100);
	const value = next.value ?? Number(root.getAttribute('aria-valuenow'));
	const progress = (value - min) / (max - min);
	const data = { 'data-progress': progress >= 1 ? 'complete' : 'loading', 'data-value': String(value), 'data-max': String(max), 'data-min': String(min) };
	const indicator = root.querySelector<HTMLElement>('[title="progress_indicator"]');
	for (const [name, v] of Object.entries(data)) {
		root.setAttribute(name, v);
		indicator?.setAttribute(name, v);
	}
	root.setAttribute('aria-valuemax', String(max));
	root.setAttribute('aria-valuemin', String(min));
	root.setAttribute('aria-valuenow', String(value));
	root.setAttribute('aria-valuetext', `${Math.round(progress * 100)}%`);
	if (root.hasAttribute('value')) root.setAttribute('value', String(value));
	root.removeAttribute('min');
	root.removeAttribute('max');
	if (indicator) indicator.style.transform = `translateX(-${100 - progress * 100}%)`;
}

// Inserts what a client-rendered example shows once its button set its signal, right after the button.
function renderAfter(button: Element, html: string): void {
	if (button.nextElementSibling?.hasAttribute('data-mm-rendered')) return;
	const t = document.createElement('template');
	t.innerHTML = html;
	for (const el of t.content.children) el.setAttribute('data-mm-rendered', '');
	button.after(t.content);
}

const PROGRESS_30 = '<div role="progressbar" aria-label="progress" aria-valuemax="100" aria-valuemin="0" aria-valuenow="30" aria-valuetext="30%" data-progress="loading" data-value="30" data-max="100" data-min="0" value="30" class="progress"><div title="progress_indicator" data-progress="loading" data-value="30" data-max="100" data-min="0" class="progress-indicator" style="transform: translateX(-70%);"></div></div>';

// progress min.tsx and max.tsx: - and + step the bound and the number shown beside them; reactive.tsx sets bind:value to 70;
// csr.tsx renders a 30% bar.
const progressDemos: Part = {
	click(target) {
		const step = target.closest<HTMLElement>(
			[on('click', 'min.tsx_min_component_decrementMin'), on('click', 'min.tsx_min_component_incrementMin'), on('click', 'max.tsx_max_component_decrement'), on('click', 'max.tsx_max_component_increment')].join(', '),
		);
		if (step) {
			const row = step.parentElement!;
			const shown = row.querySelector('span')!;
			const root = row.parentElement?.querySelector(':scope > [role="progressbar"]');
			const handler = step.getAttribute('data-mm-qwik')!;
			if (handler.includes('min.tsx')) {
				const min = Number(shown.textContent!.replace('$', ''));
				const next = handler.endsWith('decrementMin') ? (min > 0 ? min - 500 : min) : min < 5000 ? min + 500 : min;
				shown.textContent = `$${next}`;
				if (root) setProgress(root, { min: next });
			} else {
				const total = Number(shown.textContent);
				const next = handler.endsWith('decrement') ? (total > 20 ? total - 1 : total) : total + 1;
				shown.textContent = String(next);
				if (root) setProgress(root, { max: next });
			}
			return true;
		}
		const change = target.closest(on('click', 'reactive.tsx_reactive_component_Fragment_button_onClick'));
		const bar = change?.previousElementSibling;
		if (change && bar?.matches('[role="progressbar"]')) {
			setProgress(bar, { value: 70 });
			return true;
		}
		const render = target.closest(on('click', 'csr.tsx_csr_component_Fragment_button_onClick'));
		if (render?.textContent?.trim() === 'Render the progress bar') {
			renderAfter(render, PROGRESS_30);
			return true;
		}
		return false;
	},
};

export const DEMO_PARTS: readonly Part[] = [modalDemos, progressDemos];
