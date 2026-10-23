// The Extensions page's "Search Extensions" field, as its hyperscript runs it:
//   init
//     set :table to the next <table/>
//     set :initialHeight to *computed-height of :table
//   on keyup
//     if the event's key is 'Escape' then set my value to '' then trigger input end
//   on input
//     repeat in closest <tr/> to <td:first-of-type/> in :table
//       if its textContent.toLowerCase() contains my value.toLowerCase()
//         remove @hidden from it
//       else
//         add @hidden='' to it
//       end
//     end
//     show closest <tr/> to <tbody th/> in :table
//          when (the next <tr:not([hidden])/> from it within the closest <tbody/> to it) exists
//     set *margin-bottom of :table to `calc(${:initialHeight} - ${*computed-height of :table})`
// The table's height is read before the first filter changes it, rather than at load: until then nothing has moved it.
// `show` and `hide` are hyperscript's display strategy: hide sets `display: none`, show takes the property away.

const initialHeights = new WeakMap<HTMLInputElement, { table: HTMLTableElement; height: string }>();

function tableFor(input: HTMLInputElement): { table: HTMLTableElement; height: string } | undefined {
	let known = initialHeights.get(input);
	if (!known) {
		const table = [...document.getElementsByTagName('table')].find((el) => input.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
		if (!table) return undefined;
		known = { table, height: getComputedStyle(table).height };
		initialHeights.set(input, known);
	}
	return known;
}

function filter(input: HTMLInputElement): void {
	const known = tableFor(input);
	if (!known) return;
	const { table, height } = known;
	const query = input.value.toLowerCase();
	for (const cell of table.querySelectorAll('td:first-of-type')) {
		const row = cell.closest('tr');
		if (!row) continue;
		if ((row.textContent ?? '').toLowerCase().includes(query)) row.removeAttribute('hidden');
		else row.setAttribute('hidden', '');
	}
	for (const th of table.querySelectorAll('tbody th')) {
		const header = th.closest('tr');
		const body = header?.closest('tbody');
		if (!header || !body) continue;
		const shown = [...body.querySelectorAll('tr:not([hidden])')].some((row) => header.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
		if (shown) header.style.removeProperty('display');
		else header.style.display = 'none';
	}
	table.style.marginBottom = `calc(${height} - ${getComputedStyle(table).height})`;
}

export function filterExtensions(event: Event): void {
	if (event.target instanceof HTMLInputElement) filter(event.target);
}

export function clearExtensionFilter(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || !(event.target instanceof HTMLInputElement)) return;
	event.target.value = '';
	filter(event.target);
}
