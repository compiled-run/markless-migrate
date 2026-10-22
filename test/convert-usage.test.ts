import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sourceSlotResolver } from '../src/convert/usage.ts';

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
