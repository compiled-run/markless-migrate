// Radix RadioGroup's roving focus: the arrow keys move to the next or previous radio (wrapping) and check it.
export function nextRadio(target: EventTarget | null, key: string): HTMLButtonElement | undefined {
	if (!(target instanceof HTMLElement)) return undefined;
	const forward = key === 'ArrowDown' || key === 'ArrowRight';
	const back = key === 'ArrowUp' || key === 'ArrowLeft';
	if (!forward && !back) return undefined;
	const group = target.closest('[role=radiogroup]');
	const radios = [...(group?.querySelectorAll<HTMLButtonElement>('[role=radio]:not([disabled])') ?? [])];
	if (!radios.length) return undefined;
	const at = radios.indexOf(target.closest('[role=radio]') as HTMLButtonElement);
	return radios[(at + (forward ? 1 : -1) + radios.length) % radios.length];
}
