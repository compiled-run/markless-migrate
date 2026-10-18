// Alpine.js's Mask plugin, x-mask and x-mask:dynamic (MIT, Caleb Porzio).
const REGEXES: Record<string, RegExp> = { '9': /[0-9]/, a: /[a-zA-Z]/, '*': /[a-zA-Z0-9]/ };

export function formatInput(template: string, input: string): string {
	let templateMark = 0;
	let inputMark = 0;
	let output = '';
	while (templateMark < template.length && inputMark < input.length) {
		const templateChar = template[templateMark]!;
		const inputChar = input[inputMark]!;
		if (templateChar in REGEXES) {
			if (REGEXES[templateChar]!.test(inputChar)) {
				output += inputChar;
				templateMark++;
			}
			inputMark++;
		} else {
			output += templateChar;
			templateMark++;
			if (templateChar === input[inputMark]) inputMark++;
		}
	}
	return output;
}

export function formatMoney(el: HTMLInputElement, input: string, delimiter = '.', thousands?: string | null, precision = 2): string {
	if (input === '-') return '-';
	if (/^\D+$/.test(input)) return '9';
	if (thousands === null || thousands === undefined) thousands = delimiter === ',' ? '.' : ',';
	const addThousands = (value: string, separator: string) => {
		let output = '';
		let counter = 0;
		for (let i = value.length - 1; i >= 0; i--) {
			if (value[i] === separator) continue;
			if (counter === 3) {
				output = value[i] + separator + output;
				counter = 0;
			} else output = value[i] + output;
			counter++;
		}
		return output;
	};
	const minus = input.startsWith('-') ? '-' : '';
	const stripped = input.replaceAll(new RegExp(`[^0-9\\${delimiter}]`, 'g'), '');
	let template = Array.from({ length: stripped.split(delimiter)[0]!.length }).fill('9').join('');
	template = `${minus}${addThousands(template, thousands)}`;
	if (precision > 0 && input.includes(delimiter)) template += `${delimiter}${'9'.repeat(precision)}`;
	queueMicrotask(() => {
		if (el.value.endsWith(delimiter)) return;
		if (el.value[(el.selectionStart ?? 0) - 1] === delimiter) el.setSelectionRange((el.selectionStart ?? 1) - 1, (el.selectionStart ?? 1) - 1);
	});
	return template;
}

export type MaskTemplate = (input: string, money: (input: string, delimiter?: string, thousands?: string | null, precision?: number) => string) => string | false | null | undefined;

/** Formats the input on every keystroke (and on blur) by the template the expression returns for its current value. */
export function mask(el: HTMLInputElement | undefined, template: MaskTemplate): void {
	if (!el) return;
	let lastInputValue = '';
	const money = (input: string, delimiter?: string, thousands?: string | null, precision?: number) => formatMoney(el, input, delimiter, thousands, precision);
	const process = (restoreCursor = true) => {
		const input = el.value;
		const pattern = template(input, money);
		if (!pattern || pattern === 'false') return;
		if (lastInputValue.length - el.value.length === 1) {
			lastInputValue = el.value;
			return;
		}
		const set = () => {
			lastInputValue = el.value = formatInput(pattern, input);
		};
		if (!restoreCursor) return set();
		const cursor = el.selectionStart ?? 0;
		const unformatted = el.value;
		set();
		const position = formatInput(pattern, unformatted.slice(0, cursor)).length;
		el.setSelectionRange(position, position);
	};
	process(false);
	el.addEventListener('input', () => process(), { capture: true });
	el.addEventListener('blur', () => process(false));
}
