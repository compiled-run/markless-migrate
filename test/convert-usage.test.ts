import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { attr, body, find, parseDocument } from '../src/convert/dom.ts';
import { portAttributes, useResolver } from '../src/convert/parts.ts';
import { sourceSlotResolver, usageResolver } from '../src/convert/usage.ts';

test('a slot a wrapper passes on, through another wrapper, names the library part the inner one renders', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-slots-'));
	await mkdir(join(dir, 'ui'), { recursive: true });
	await writeFile(join(dir, 'ui/dropdown-menu.tsx'), 'import { Menu } from "@base-ui/react/menu";\nexport function DropdownMenuTrigger(props) {\n\treturn <Menu.Trigger data-slot="dropdown-menu-trigger" {...props} />;\n}\n');
	await writeFile(join(dir, 'ui/menubar.tsx'), 'import { DropdownMenuTrigger } from "./dropdown-menu";\nfunction MenubarTrigger({ className, ...props }) {\n\treturn <DropdownMenuTrigger data-slot="menubar-trigger" className={className} {...props} />;\n}\nfunction Fixed(props) {\n\treturn <DropdownMenuTrigger {...props} data-slot="kept-own" />;\n}\n');
	const libraries = {
		libraries: [{ name: '@base-ui/react', class: 'parity', exports: [{ name: 'Menu.Trigger', sites: [{ file: 'ui/dropdown-menu.tsx', line: 3, in: 'ui/dropdown-menu.tsx#DropdownMenuTrigger', kind: 'element', props: { 'data-slot': '"dropdown-menu-trigger"', '...': '{...props}' } }] }] }],
	};
	await writeFile(join(dir, 'libraries.json'), JSON.stringify(libraries));
	const resolver = await sourceSlotResolver(join(dir, 'libraries.json'), dir);
	assert.deepEqual(resolver.candidates('menubar-trigger').map((c) => `${c.library} ${c.export}`), ['@base-ui/react Menu.Trigger']);
	assert.deepEqual(resolver.candidates('dropdown-menu-trigger').map((c) => c.export), ['Menu.Trigger']);
	assert.deepEqual(resolver.candidates('kept-own').map((c) => c.export), ['Menu.Trigger'], 'a slot written after the spread is the element\'s own');
	await rm(dir, { recursive: true, force: true });
});

test('a React Aria part the source renders with autoFocus at its data-slot is marked to take focus once the page is live', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-autofocus-'));
	await mkdir(join(dir, 'ui'), { recursive: true });
	await writeFile(join(dir, 'ui/command.tsx'), 'import { SearchField } from "react-aria-components";\nexport function CommandInput(props) {\n\treturn <SearchField\n\t\tautoFocus\n\t\tdata-slot="command-input-wrapper"\n\t/>;\n}\nexport function Other(props) {\n\treturn <SearchField data-slot="other-input-wrapper" />;\n}\n');
	const behaviour = (slot: string, line: number) => ({ kind: 'component', library: 'react-aria-components', feature: 'SearchField', details: { props: { autoFocus: [true], 'data-slot': [slot] } }, sites: [{ file: 'ui/command.tsx', line }] });
	await writeFile(join(dir, 'usage.json'), JSON.stringify({ behaviours: [behaviour('command-input-wrapper', 3), behaviour('other-input-wrapper', 9)] }));
	useResolver(await usageResolver(join(dir, 'usage.json'), dir));
	const wrapper = (slot: string) => find(body(parseDocument(`<body><div data-slot="${slot}" data-rac=""><input data-rac=""></div></body>`)), (e) => attr(e, 'data-slot') === slot)!;
	assert.ok(portAttributes(wrapper('command-input-wrapper'))?.extra?.includes('data-mm-autofocus=""'));
	assert.equal(portAttributes(wrapper('other-input-wrapper')), undefined);
	await rm(dir, { recursive: true, force: true });
});

test("the offsets a wrapper passes on with a slot of its own are its own, else the defaults of the wrapper it renders", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-offsets-'));
	await mkdir(join(dir, 'ui'), { recursive: true });
	await writeFile(
		join(dir, 'ui/dropdown-menu.tsx'),
		'import { Menu } from "@base-ui/react/menu";\nexport function DropdownMenuContent({ sideOffset = 4, alignOffset = 0, ...props }) {\n\treturn <Menu.Positioner sideOffset={sideOffset} alignOffset={alignOffset}><Menu.Popup data-slot="dropdown-menu-content" {...props} /></Menu.Positioner>;\n}\nexport function DropdownMenuSubContent({ alignOffset = -3, sideOffset = 0, ...props }) {\n\treturn <DropdownMenuContent data-slot="dropdown-menu-sub-content" alignOffset={alignOffset} sideOffset={sideOffset} {...props} />;\n}\n',
	);
	await writeFile(
		join(dir, 'ui/context-menu.tsx'),
		'import { Menu } from "@base-ui/react/menu";\nfunction ContextMenuContent({ sideOffset = 0, alignOffset = 4, ...props }) {\n\treturn <Menu.Positioner sideOffset={sideOffset} alignOffset={alignOffset}><Menu.Popup data-slot="context-menu-content" {...props} /></Menu.Positioner>;\n}\nfunction ContextMenuSubContent(props) {\n\treturn <ContextMenuContent\n\t\tdata-slot="context-menu-sub-content"\n\t\tside="right"\n\t\t{...props}\n\t/>;\n}\n',
	);
	const popup = (file: string, fn: string, slot: string) => ({ file, line: 3, in: `${file}#${fn}`, kind: 'element', props: { 'data-slot': `"${slot}"`, '...': '{...props}' } });
	const positioner = (file: string, fn: string) => ({ file, line: 3, in: `${file}#${fn}`, kind: 'element', props: { sideOffset: '{sideOffset}', alignOffset: '{alignOffset}' } });
	const libraries = {
		libraries: [
			{
				name: '@base-ui/react',
				class: 'parity',
				exports: [
					{ name: 'Menu.Popup', sites: [popup('ui/dropdown-menu.tsx', 'DropdownMenuContent', 'dropdown-menu-content'), popup('ui/context-menu.tsx', 'ContextMenuContent', 'context-menu-content')] },
					{ name: 'Menu.Positioner', sites: [positioner('ui/dropdown-menu.tsx', 'DropdownMenuContent'), positioner('ui/context-menu.tsx', 'ContextMenuContent')] },
				],
			},
		],
	};
	await writeFile(join(dir, 'libraries.json'), JSON.stringify(libraries));
	const resolver = await sourceSlotResolver(join(dir, 'libraries.json'), dir);
	const offsets = (slot: string) => [resolver.forwardedProp?.(slot, 'sideOffset'), resolver.forwardedProp?.(slot, 'alignOffset')];
	assert.deepEqual(offsets('dropdown-menu-sub-content'), ['0', '-3'], "the sub-content's own parameter defaults");
	assert.deepEqual(offsets('context-menu-sub-content'), ['0', '4'], 'none written: the defaults of the content it renders');
	assert.deepEqual(offsets('dropdown-menu-content'), [undefined, undefined], 'a slot written on the library part itself is not forwarded');
	await rm(dir, { recursive: true, force: true });
});
