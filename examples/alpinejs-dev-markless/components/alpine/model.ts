// Alpine.js's x-model reads and writes (MIT, Caleb Porzio).
type Field = HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;

const isCheckbox = (el: Element) => (el as HTMLInputElement).type === 'checkbox';
const isRadio = (el: Element) => (el as HTMLInputElement).type === 'radio';

function safeParseNumber(raw: unknown): unknown {
	const number = raw ? parseFloat(String(raw)) : null;
	return !Array.isArray(number) && !Number.isNaN(number) && number !== null ? number : raw;
}

export function safeParseBoolean(raw: unknown): boolean | null {
	if ([1, '1', 'true', 'on', 'yes', true].includes(raw as never)) return true;
	if ([0, '0', 'false', 'off', 'no', false].includes(raw as never)) return false;
	return raw ? Boolean(raw) : null;
}

/** The value x-model writes for this event. */
export function modelValue(el: Element, modifiers: readonly string[], event: Event, current: unknown): unknown {
	const target = (event.target ?? el) as Field;
	if (event instanceof CustomEvent && event.detail !== undefined) return event.detail ?? target.value;
	if (isCheckbox(el)) {
		if (Array.isArray(current)) {
			const value = modifiers.includes('number') ? safeParseNumber(target.value) : modifiers.includes('boolean') ? safeParseBoolean(target.value) : target.value;
			return target.checked ? (current.includes(value) ? current : current.concat([value])) : current.filter((item) => item != value);
		}
		return target.checked;
	}
	if (el.tagName === 'SELECT' && (el as HTMLSelectElement).multiple) {
		return Array.from(target.selectedOptions).map((option) => {
			const raw = option.value || option.text;
			return modifiers.includes('number') ? safeParseNumber(raw) : modifiers.includes('boolean') ? safeParseBoolean(raw) : raw;
		});
	}
	const value = isRadio(el) ? (target.checked ? target.value : current) : target.value;
	if (modifiers.includes('number')) return safeParseNumber(value);
	if (modifiers.includes('boolean')) return safeParseBoolean(value);
	if (modifiers.includes('trim')) return String(value).trim();
	return value;
}

/** Puts a model value on its element, as Alpine's x-model effect does after any write. */
export function syncModel(el: Element | undefined, value: unknown): void {
	if (!el) return;
	const field = el as Field;
	if (isCheckbox(el)) {
		field.checked = Array.isArray(value) ? value.some((v) => v == field.value) : !!value;
	} else if (isRadio(el)) {
		field.checked = typeof value === 'boolean' ? safeParseBoolean(field.value) === value : field.value == value;
	} else if (el.tagName === 'SELECT') {
		const wanted = ([] as unknown[]).concat(value).map((v) => `${v}`);
		for (const option of Array.from(field.options)) option.selected = wanted.includes(option.value);
	} else if ('value' in el) {
		if (field.value === value) return;
		field.value = value === undefined ? '' : String(value);
	}
}
