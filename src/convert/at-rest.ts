import type { Element } from './dom.ts';

/** Puts an element of a layer captured open back as the server renders it closed. */
export function atRest(el: Element): void {
	// A Radix tooltip's trigger names its content only while it is open (focused or hovered as captured).
	if (el.attrs.some((a) => a.name === 'data-state' && (a.value === 'instant-open' || a.value === 'delayed-open'))) el.attrs = el.attrs.filter((a) => a.name !== 'aria-describedby');
	for (const a of el.attrs) if (a.name === 'data-state' && (a.value === 'open' || a.value === 'instant-open' || a.value === 'delayed-open')) a.value = 'closed';
	// Radix's and Base UI's highlighted item: where focus or the pointer was as captured, set by the parts as it moves.
	el.attrs = el.attrs.filter((a) => a.name !== 'data-highlighted');
	// A Radix SelectItem is aria-selected only while it is both chosen and focused (captured open, it was).
	if (el.attrs.some((a) => a.name === 'role' && a.value === 'option') && el.attrs.some((a) => a.name === 'data-state')) for (const a of el.attrs) if (a.name === 'aria-selected') a.value = 'false';
	// cmdk selects its first item as it mounts, so a closed layer's command holds none (parts/cmdk.ts selects on open).
	if (el.attrs.some((a) => a.name === 'cmdk-item')) for (const a of el.attrs) if (a.name === 'aria-selected' || a.name === 'data-selected') a.value = 'false';
	if (el.attrs.some((a) => a.name === 'data-open')) el.attrs = [...el.attrs.filter((a) => a.name !== 'data-open'), { name: 'data-closed', value: '' }];
	// React Aria's interaction states as the capture left them: the interactions part writes them as they happen.
	if (el.attrs.some((a) => a.name === 'data-rac' || a.name === 'data-react-aria-pressable')) el.attrs = el.attrs.filter((a) => !/^data-(focused|focus-visible|hovered|pressed|focus-within|focus-visible-within)$/.test(a.name));
}
