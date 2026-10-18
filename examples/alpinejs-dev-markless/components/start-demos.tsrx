import { computed, state } from '@markless/core';

// The /start-here demos: each Alpine x-data block becomes a component with its own state.
const ITEMS = ['foo', 'bar', 'baz'];

export function CounterDemo() @{
	let count = state(0);

	<div class="demo">
		<div>
			<button onClick={() => count++}>Increment</button>
			{' '}
			<span>{count}</span>
		</div>
	</div>
}

export function DropdownDemo() @{
	let open = state(false);

	<div class="demo">
		<div
			attach={(demo) => {
				// The Toggle button is left out, as Alpine's x-show (still hidden while the click that opens it runs) leaves it out.
				const [toggle, contents] = [demo.firstElementChild!, demo.lastElementChild!];
				const outside = (event: MouseEvent) => {
					const target = event.target as Node;
					if (!contents.contains(target) && !toggle.contains(target)) open = false;
				};
				document.addEventListener('click', outside);
				return () => document.removeEventListener('click', outside);
			}}
		>
			<button onClick={() => (open = !open)}>Toggle</button>
			<div style={open ? '' : 'display: none;'}>Contents...</div>
		</div>
	</div>
}

export function SearchDemo() @{
	let search = state('');
	const filtered = computed(() => ITEMS.filter((item) => item.startsWith(search)));

	<div class="demo">
		<div>
			<input placeholder="Search..." value={search} onInput={(event) => (search = (event.target as HTMLInputElement).value)} />
			<ul class="pl-6 pt-2">
				<template></template>
				@for (const item of filtered; key item) {
					<li>{item}</li>
				}
			</ul>
		</div>
	</div>
}
