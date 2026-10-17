#!/usr/bin/env python3
"""Writes examples/shadcn-admin-markless/pages/users.tsrx: the users page (features/users) with its table
unrolled into fixed slots. Classes come from the old app's rendered DOM; icons from the parity icon ports.
Usage: python3 gen-users.py"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '../../../examples/shadcn-admin-markless')
SLOTS = 50
PAGE_SLOTS = 7


def icon(pack, name, klass):
    src = open(os.path.join(APP, f'lib/parity/{pack}/components.tsrx')).read()
    m = re.search(r'export function ' + name + r'\(.*?\n\t(<svg.*?</svg>)\n', src, re.S)
    svg = m.group(1)
    base = re.search(r'export function ' + name + r'\(.*?computed\(\(\) => \(klass \? "([^"]*?) " \+ klass', src, re.S)
    whole = f'{base.group(1)} {klass}'.strip() if base and pack == 'lucide-react' else klass
    svg = re.sub(r'class=\{\w+\}', f'class="{whole}"', svg)
    svg = re.sub(r'width=\{\w+\}', 'width="24"', svg)
    svg = re.sub(r'height=\{\w+\}', 'height="24"', svg)
    return svg


def lucide(name, klass, size=24):
    return icon('lucide-react', name, klass).replace('width="24"', f'width="{size}"').replace('height="24"', f'height="{size}"')


def radix(name, klass):
    return icon('radix-ui-react-icons', name, klass)


BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
BTN_NOFLEX = BTN.replace('inline-flex items-center justify-center gap-2 ', 'items-center justify-center ', 1)
OUTLINE = 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50'
GHOST = 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50'
TH = 'h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground *:[[role=checkbox]]:translate-y-0.5 bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted'
CHECKBOX = 'peer size-4 shrink-0 rounded-lg border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary translate-y-0.5'
SORT_TRIGGER = BTN.replace(' gap-2', '').replace(' rounded-md', '') + f' {GHOST} rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 h-8 data-[state=open]:bg-accent'
FILTER_TRIGGER = BTN.replace(' gap-2', '').replace(' rounded-md', '') + f' {OUTLINE} rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 h-8 border-dashed'
VIEW_TRIGGER = BTN_NOFLEX.replace(' gap-2', '').replace(' rounded-md', '') + f' {OUTLINE} rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 ms-auto hidden h-8 lg:flex'
MENU_ITEM_ICON = 'size-3.5 text-muted-foreground/70'
BADGE_SECONDARY = "inline-flex items-center justify-center border py-0.5 text-xs w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 rounded-sm px-1 font-normal"
SEPARATOR_V = 'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px'
CMD_ITEM = "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"
CMD_GROUP = 'overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground'
POPOVER = 'z-50 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 w-50 p-0'
SELECT_CONTENT = 'relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1 p-0'
SELECT_TRIGGER = "flex items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground h-8 w-17.5"
INPUT = 'flex min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40'
PAGER = f'{BTN} {OUTLINE} has-[>svg]:px-3 size-8 p-0'

STATUS = [('active', 'Active', None), ('inactive', 'Inactive', None), ('invited', 'Invited', None), ('suspended', 'Suspended', None)]
ROLES = [('superadmin', 'Superadmin', 'Shield'), ('admin', 'Admin', 'UserCheck'), ('manager', 'Manager', 'Users'), ('cashier', 'Cashier', 'CreditCard')]

INPUT_EXPR = '{ sorting, username, status, role, page, pageSize, selected, hidden }'
URL_EXPR = '{ username, status, role, page, pageSize }'


def cap(s):
    return s[0].upper() + s[1:]


def facet_filter(column, title, options):
    c = column
    C = cap(column)
    lines = []
    lines.append(f'\t\t\t\t\t<DropdownMenuTrigger menu="filter-{c}" haspopup="dialog" slot="popover-trigger" class="{FILTER_TRIGGER}">')
    lines.append(f'\t\t\t\t\t\t{radix("PlusCircledIcon", "size-4")}')
    lines.append(f'\t\t\t\t\t\t{title}')
    lines.append(f'\t\t\t\t\t\t<div data-orientation="vertical" role="none" data-slot="separator" class="{SEPARATOR_V} mx-2 h-4" hidden={{{c}None}}></div>')
    lines.append(f'\t\t\t\t\t\t<span data-slot="badge" class="{BADGE_SECONDARY} lg:hidden" hidden={{{c}None}}>{{{c}Count}}</span>')
    lines.append(f'\t\t\t\t\t\t<div class="hidden space-x-1 lg:flex" hidden={{{c}None}}>')
    lines.append(f'\t\t\t\t\t\t\t<span data-slot="badge" class="{BADGE_SECONDARY}" hidden={{{c}FewOrNone}}>{{{c}CountLabel}}</span>')
    for v, label, _ in options:
        lines.append(f'\t\t\t\t\t\t\t<span data-slot="badge" class="{BADGE_SECONDARY}" hidden={{{c}{cap(v)}NoBadge}}>{label}</span>')
    lines.append('\t\t\t\t\t\t</div>')
    lines.append('\t\t\t\t\t</DropdownMenuTrigger>')
    return '\n'.join(lines)


def facet_content(column, title, options):
    c = column
    lines = []
    lines.append(f'\t<PopoverContent menu="filter-{c}" align="start" class="{POPOVER}">')
    lines.append(f'\t\t<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground" cmdk-root="" id="filter-{c}-command" onKeydown={{(event) => {{')
    lines.append("\t\t\tif (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {")
    lines.append('\t\t\t\tevent.preventDefault();')
    lines.append(f"\t\t\t\tmoveIn(document.getElementById('filter-{c}-command'), event.key);")
    lines.append('\t\t\t}')
    lines.append("\t\t\tif (event.key === 'Enter') {")
    lines.append('\t\t\t\tevent.preventDefault();')
    lines.append('\t\t\t}')
    lines.append(f"\t\t\tconst option = event.key === 'Enter' ? chosenIn(document.getElementById('filter-{c}-command')) : undefined;")
    lines.append('\t\t\tif (option) {')
    lines.append(f'\t\t\t\t{c} = option === \'clear\' ? \'\' : toggleValue({c}, option);')
    lines.append('\t\t\t\tpage = 1;')
    lines.append('\t\t\t\tpushSearch({ username, status, role, page, pageSize });')
    lines.append('\t\t\t}')
    lines.append('\t\t}}>')
    lines.append(f'\t\t\t<label cmdk-label="" for="filter-{c}-input" id="filter-{c}-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>')
    lines.append('\t\t\t<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">')
    lines.append(f'\t\t\t\t{lucide("SearchIcon", "size-4 shrink-0 opacity-50")}')
    lines.append(f'\t\t\t\t<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="{title}" cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="filter-{c}-list" aria-labelledby="filter-{c}-label" id="filter-{c}-input" type="text" value="" onInput={{(event) => filterIn(document.getElementById(\'filter-{c}-command\'), (event.target as HTMLInputElement).value)}} />')
    lines.append('\t\t\t</div>')
    lines.append(f'\t\t\t<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="filter-{c}-list" onClick={{(event) => {{')
    lines.append(f"\t\t\t\tconst option = chosenIn(document.getElementById('filter-{c}-command'), event.target);")
    lines.append('\t\t\t\tif (option) {')
    lines.append(f'\t\t\t\t\t{c} = option === \'clear\' ? \'\' : toggleValue({c}, option);')
    lines.append('\t\t\t\t\tpage = 1;')
    lines.append('\t\t\t\t\tpushSearch({ username, status, role, page, pageSize });')
    lines.append('\t\t\t\t}')
    lines.append('\t\t\t}}>')
    lines.append('\t\t\t\t<div cmdk-list-sizer="">')
    lines.append('\t\t\t\t\t<div cmdk-empty="" role="presentation" class="py-6 text-center text-sm" data-slot="command-empty" hidden>No results found.</div>')
    lines.append(f'\t\t\t\t\t<div data-slot="command-group" class="{CMD_GROUP}" cmdk-group="" role="presentation" data-value="undefined">')
    lines.append('\t\t\t\t\t\t<div cmdk-group-items="" role="group">')
    for i, (v, label, ic) in enumerate(options):
        V = cap(v)
        sel = 'true' if i == 0 else 'false'
        lines.append(f'\t\t\t\t\t\t\t<div data-slot="command-item" class="{CMD_ITEM}" id="filter-{c}-{v}" cmdk-item="" role="option" aria-disabled="false" aria-selected="{sel}" data-disabled="false" data-selected="{sel}" data-value={{{c}{V}Value}} data-option="{v}">')
        lines.append(f'\t\t\t\t\t\t\t\t<div class={{{c}{V}BoxClass}}>')
        lines.append(f'\t\t\t\t\t\t\t\t\t{radix("CheckIcon", "h-4 w-4 text-background")}')
        lines.append('\t\t\t\t\t\t\t\t</div>')
        if ic:
            lines.append(f'\t\t\t\t\t\t\t\t{lucide(ic, "size-4 text-muted-foreground")}')
        lines.append(f'\t\t\t\t\t\t\t\t<span>{label}</span>')
        lines.append(f'\t\t\t\t\t\t\t\t<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={{{c}{V}NoFacet}}>{{{c}{V}Facet}}</span>')
        lines.append('\t\t\t\t\t\t\t</div>')
    lines.append('\t\t\t\t\t\t</div>')
    lines.append('\t\t\t\t\t</div>')
    lines.append(f'\t\t\t\t\t<div data-slot="command-separator" class="-mx-1 h-px bg-border" cmdk-separator="" role="separator" hidden={{{c}None}}></div>')
    lines.append(f'\t\t\t\t\t<div data-slot="command-group" class="{CMD_GROUP}" cmdk-group="" role="presentation" data-value="undefined" hidden={{{c}None}}>')
    lines.append('\t\t\t\t\t\t<div cmdk-group-items="" role="group">')
    lines.append(f'\t\t\t\t\t\t\t<div data-slot="command-item" class="{CMD_ITEM} justify-center text-center" id="filter-{c}-clear" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Clear filters" data-option="clear">Clear filters</div>')
    lines.append('\t\t\t\t\t\t</div>')
    lines.append('\t\t\t\t\t</div>')
    lines.append('\t\t\t\t</div>')
    lines.append('\t\t\t</div>')
    lines.append('\t\t</div>')
    lines.append('\t</PopoverContent>')
    return '\n'.join(lines)


def facet_computeds(column, options):
    c = column
    out = [
        f'\tconst {c}None = computed(() => countOf({c}) === 0);',
        f'\tconst {c}Count = computed(() => String(countOf({c})));',
        f'\tconst {c}FewOrNone = computed(() => countOf({c}) <= 2);',
        f'\tconst {c}CountLabel = computed(() => `${{countOf({c})}} selected`);',
    ]
    for v, label, _ in options:
        V = cap(v)
        out.append(f"\tconst {c}{V}NoBadge = computed(() => countOf({c}) > 2 || !hasValue({c}, '{v}'));")
        out.append(f"\tconst {c}{V}BoxClass = computed(() => (hasValue({c}, '{v}') ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'));")
        out.append(f"\tconst {c}{V}Facet = computed(() => facet(model, '{c}', '{v}'));")
        out.append(f"\tconst {c}{V}NoFacet = computed(() => facet(model, '{c}', '{v}') === '');")
        out.append(f"\tconst {c}{V}Value = computed(() => '{label}' + facet(model, '{c}', '{v}'));")
    return '\n'.join(out)


def sort_header(col, title, hide):
    lines = []
    lines.append('\t\t\t\t\t\t\t\t<div class="flex items-center space-x-2">')
    lines.append(f'\t\t\t\t\t\t\t\t\t<DropdownMenuTrigger menu="sort-{col}" class="{SORT_TRIGGER}">')
    lines.append(f'\t\t\t\t\t\t\t\t\t\t<span>{title}</span>')
    lines.append('\t\t\t\t\t\t\t\t\t\t' + radix('ArrowDownIcon', 'ms-2 h-4 w-4').replace('<svg ', f'<svg hidden={{{col}NotDesc}} ', 1))
    lines.append('\t\t\t\t\t\t\t\t\t\t' + radix('ArrowUpIcon', 'ms-2 h-4 w-4').replace('<svg ', f'<svg hidden={{{col}NotAsc}} ', 1))
    lines.append('\t\t\t\t\t\t\t\t\t\t' + radix('CaretSortIcon', 'ms-2 h-4 w-4').replace('<svg ', f'<svg hidden={{{col}Sorted}} ', 1))
    lines.append('\t\t\t\t\t\t\t\t\t</DropdownMenuTrigger>')
    lines.append('\t\t\t\t\t\t\t\t</div>')
    return '\n'.join(lines)


def sort_content(col, hide):
    lines = [f'\t<DropdownMenuContent menu="sort-{col}" align="start">']
    lines.append(f"\t\t<DropdownMenuItem menu=\"sort-{col}\" onSelect={{() => {{ sorting = '{col}:asc'; }}}}>")
    lines.append(f'\t\t\t{radix("ArrowUpIcon", MENU_ITEM_ICON)}')
    lines.append('\t\t\tAsc')
    lines.append('\t\t</DropdownMenuItem>')
    lines.append(f"\t\t<DropdownMenuItem menu=\"sort-{col}\" onSelect={{() => {{ sorting = '{col}:desc'; }}}}>")
    lines.append(f'\t\t\t{radix("ArrowDownIcon", MENU_ITEM_ICON)}')
    lines.append('\t\t\tDesc')
    lines.append('\t\t</DropdownMenuItem>')
    if hide:
        lines.append('\t\t<DropdownMenuSeparator />')
        lines.append(f"\t\t<DropdownMenuItem menu=\"sort-{col}\" onSelect={{() => {{ hidden = hasValue(hidden, '{col}') ? hidden : toggleValue(hidden, '{col}'); }}}}>")
        lines.append(f'\t\t\t{radix("EyeNoneIcon", MENU_ITEM_ICON)}')
        lines.append('\t\t\tHide')
        lines.append('\t\t</DropdownMenuItem>')
    lines.append('\t</DropdownMenuContent>')
    return '\n'.join(lines)


def page_slot(i):
    return '\n'.join([
        f'\t\t\t\t\t<div class="flex items-center" hidden={{page{i}Hidden}}>',
        f'\t\t\t\t\t\t<span class="px-1 text-sm text-muted-foreground" hidden={{page{i}NotEllipsis}}>...</span>',
        f'\t\t\t\t\t\t<button data-slot="button" class={{page{i}Class}} hidden={{page{i}Ellipsis}} onClick={{() => {{ page = pageAtSlot({INPUT_EXPR}, {i}); pushSearch({URL_EXPR}); }}}}>',
        f'\t\t\t\t\t\t\t<span class="sr-only">{{page{i}Label}}</span>',
        # The number in its own span: a text hole beside the sr-only span would wipe it on update.
        f'\t\t\t\t\t\t\t<span>{{page{i}Number}}</span>',
        '\t\t\t\t\t\t</button>',
        '\t\t\t\t\t</div>',
    ])


def page_computeds(i):
    return '\n'.join([
        f"\tconst page{i}Hidden = computed(() => !pageField(model.pages, {i}, 'shown'));",
        f"\tconst page{i}Ellipsis = computed(() => pageField(model.pages, {i}, 'ellipsis') === true);",
        f"\tconst page{i}NotEllipsis = computed(() => pageField(model.pages, {i}, 'ellipsis') !== true);",
        f"\tconst page{i}Class = computed(() => pageField(model.pages, {i}, 'className'));",
        f"\tconst page{i}Label = computed(() => `Go to page ${{pageField(model.pages, {i}, 'label')}}`);",
        f"\tconst page{i}Number = computed(() => pageField(model.pages, {i}, 'label'));",
    ])


# Timers, not await: Markless 0.4.0 holds every later event until a pending async handler settles.
ANNOUNCE = "announcement = announcementFor(countOf(selected)); setTimeout(() => { announcement = ''; }, 3000);"


def row_slot(i):
    return f'\t\t\t\t\t\t\t\t<UserRow rows={{rows}} slot={{{i}}} onToggle={{() => {{ selected = toggleRow({INPUT_EXPR}, {i}); {ANNOUNCE} }}}} />'


def bulk_button(label, ic, handler, destructive=False):
    variant = 'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60' if destructive else OUTLINE
    return '\n'.join([
        f'\t\t\t\t<button data-slot="button" class="{BTN} {variant} size-8" aria-label="{label}" title="{label}" data-state="closed" onClick={{{handler}}}>',
        f'\t\t\t\t\t{lucide(ic, "")}'.replace(' class="lucide lucide-' , ' class="lucide lucide-'),
        f'\t\t\t\t\t<span class="sr-only">{label}</span>',
        '\t\t\t\t</button>',
    ])


def bulk_handler(loading, success, error):
    return ('() => {\n'
            f'\t\t\t\t\tconst count = countOf(selected);\n'
            "\t\t\t\t\tconst id = `bulk-${Date.now()}`;\n"
            f'\t\t\t\t\ttoasts = promiseLoading(toasts, id, {loading});\n'
            "\t\t\t\t\tselected = '';\n"
            '\t\t\t\t\tsetTimeout(() => {\n'
            f'\t\t\t\t\t\ttoasts = promiseSuccess(toasts, id, {success});\n'
            '\t\t\t\t\t\tsetTimeout(() => {\n'
            '\t\t\t\t\t\t\ttoasts = expired(toasts, id);\n'
            '\t\t\t\t\t\t}, DURATION);\n'
            '\t\t\t\t\t}, 2000);\n'
            '\t\t\t\t}')


def main():
    status_filter = facet_filter('status', 'Status', STATUS)
    role_filter = facet_filter('role', 'Role', ROLES)
    plural = "${count > 1 ? 's' : ''}"
    out = f"""// The users page (features/users): the table over @tanstack/table-core (lib/users-table.ts), its toolbar,
// faceted filters, column menus, pagination and bulk actions, the row actions menu and the delete dialog.
// Written by deploy/shadcn-admin/scripts/gen-users.py from the old app's rendered DOM: the rows and page
// buttons are fixed slots (Markless 0.4.0 does not update an @for over a computed list), one UserRow per row.
import {{ computed, state }} from '@markless/core';
import type {{ PageProps }} from '@markless/router';
import {{ Shell }} from '../components/layout/shell.tsrx';
import {{ UserRow }} from '../components/users/user-row.tsrx';
import {{ chosenIn, filterIn, moveIn }} from '../lib/parity/cmdk/behaviour.ts';
import {{ DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger, menus, PopoverContent, SelectItem }} from '../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import {{ DURATION, expired, message, promiseLoading, promiseSuccess, type Toast }} from '../lib/parity/sonner/index.ts';
import {{ Toaster }} from '../lib/parity/sonner/toaster.tsrx';
import {{ closeConfirm, escapeClears, moveToolbarFocus, openConfirm }} from '../lib/users-behaviour.ts';
import {{ announcementFor, countOf, field, deleteSummary, facet, fromSearch, hasValue, hiddenColumns, lastPage, pageAtSlot, pageField, pushSearch, rowSlot, tableModel, toggleAllOnPage, toggleRow, toggleValue, userAt }} from '../lib/parity/tanstack-react-table/users-table.ts';

export default function Users({{ url }}: PageProps) @{{
	const initial = fromSearch(url.search);
	let sorting = state('');
	let username = state(initial.username);
	let status = state(initial.status);
	let role = state(initial.role);
	let page = state(initial.page);
	let pageSize = state(initial.pageSize);
	let selected = state('');
	let hidden = state('');
	const m = menus();
	let deleteOpen = state(false);
	let deleteValue = state('');
	let deleteName = state('');
	let deleteRole = state('');
	let announcement = state('');
	let toasts = state<Toast[]>([]);

	const model = computed(() => tableModel({INPUT_EXPR}));
	const rows = computed(() => model.rows);
	const tableClass = computed(() => `w-full caption-bottom text-sm ${{hiddenColumns(hidden)}}`);
	const headerChecked = computed(() => model.headerChecked);
	const headerState = computed(() => model.headerState);
	const headerUnchecked = computed(() => model.headerChecked === 'false');
	const hasRows = computed(() => field(model.rows, 0, 'shown') === true);
	const notFiltered = computed(() => !model.filtered);
	const pageLabel = computed(() => model.pageLabel);
	const cannotPrevious = computed(() => !model.canPrevious);
	const cannotNext = computed(() => !model.canNext);
	const pageSizeLabel = computed(() => String(pageSize));
	const usernameNotAsc = computed(() => sorting !== 'username:asc');
	const usernameNotDesc = computed(() => sorting !== 'username:desc');
	const usernameSorted = computed(() => sorting === 'username:asc' || sorting === 'username:desc');
	const emailNotAsc = computed(() => sorting !== 'email:asc');
	const emailNotDesc = computed(() => sorting !== 'email:desc');
	const emailSorted = computed(() => sorting === 'email:asc' || sorting === 'email:desc');
	const emailShown = computed(() => (hasValue(hidden, 'email') ? 'false' : 'true'));
	const phoneShown = computed(() => (hasValue(hidden, 'phoneNumber') ? 'false' : 'true'));
	const size10 = computed(() => (pageSize === 10 ? 'true' : 'false'));
	const size20 = computed(() => (pageSize === 20 ? 'true' : 'false'));
	const size30 = computed(() => (pageSize === 30 ? 'true' : 'false'));
	const size40 = computed(() => (pageSize === 40 ? 'true' : 'false'));
	const size50 = computed(() => (pageSize === 50 ? 'true' : 'false'));
	const noSelection = computed(() => countOf(selected) === 0);
	const selectedCount = computed(() => String(countOf(selected)));
	const selectedCountLabel = computed(() => `${{countOf(selected)}} selected`);
	const selectedNoun = computed(() => (countOf(selected) > 1 ? 'users' : 'user'));
	const toolbarLabel = computed(() => `Bulk actions for ${{countOf(selected)}} selected user${{countOf(selected) > 1 ? 's' : ''}}`);
	const deleteClosed = computed(() => !deleteOpen);
	const deleteState = computed(() => (deleteOpen ? 'open' : 'closed'));
	const deleteDisabled = computed(() => deleteValue.trim() !== deleteName);
	const deleteRoleUpper = computed(() => deleteRole.toUpperCase());
{facet_computeds('status', STATUS)}
{facet_computeds('role', ROLES)}
{chr(10).join(page_computeds(i) for i in range(PAGE_SLOTS))}

	<Shell active="/users" topNav={{false}}>
		<main data-layout="auto" class="px-4 py-6 @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl flex flex-1 flex-col gap-4 sm:gap-6">
			<div class="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h2 class="text-2xl font-bold tracking-tight">User List</h2>
					<p class="text-muted-foreground">Manage your users and their roles here.</p>
				</div>
				<div class="flex gap-2">
					<button data-slot="button" class="{BTN} {OUTLINE} h-9 px-4 py-2 has-[>svg]:px-3 space-x-1">
						<span>Invite User</span>
						{lucide('MailPlus', '', 18)}
					</button>
					<button data-slot="button" class="{BTN} bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3 space-x-1">
						<span>Add User</span>
						{lucide('UserPlus', '', 18)}
					</button>
				</div>
			</div>
			<div class={{"max-sm:has-[div[role=\\"toolbar\\"]]:mb-16 flex flex-1 flex-col gap-4"}}>
				<div class="flex items-center justify-between">
					<div class="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2" data-trailing-hidden="">
						<input data-slot="input" class="{INPUT} h-8 w-37.5 lg:w-62.5" placeholder="Filter users..." value={{username}} onInput={{(event) => {{ username = (event.target as HTMLInputElement).value; page = 1; pushSearch({URL_EXPR}); }}}} />
						<div class="flex gap-x-2">
{status_filter}
{role_filter}
						</div>
						<button data-slot="button" class="{BTN} {GHOST} py-2 has-[>svg]:px-3 h-8 px-2 lg:px-3" hidden={{notFiltered}} onClick={{() => {{ username = ''; status = ''; role = ''; page = 1; pushSearch({URL_EXPR}); }}}}>
							Reset
							{radix('Cross2Icon', 'ms-2 h-4 w-4')}
						</button>
					</div>
					<DropdownMenuTrigger menu="view-options" class="{VIEW_TRIGGER}">
						{radix('MixerHorizontalIcon', 'size-4')}
						View
					</DropdownMenuTrigger>
				</div>
				<div class="overflow-hidden rounded-md border">
					<div data-slot="table-container" class="relative w-full overflow-x-auto">
						<table data-slot="table" class={{tableClass}}>
							<thead data-slot="table-header" class="[&_tr]:border-b">
								<tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted group/row">
									<th data-slot="table-head" class="{TH} inset-s-0 z-10 rounded-tl-[inherit] max-md:sticky" colspan="1">
										<button type="button" role="checkbox" aria-checked={{headerChecked}} data-state={{headerState}} value="on" data-slot="checkbox" class="{CHECKBOX}" aria-label="Select all" onClick={{() => {{ selected = toggleAllOnPage({INPUT_EXPR}); {ANNOUNCE} }}}}>
											<span data-state={{headerState}} data-slot="checkbox-indicator" class="flex items-center justify-center text-current transition-none" style="pointer-events: none;" hidden={{headerUnchecked}}>
												<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
											</span>
										</button>
									</th>
									<th data-slot="table-head" class="{TH} drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.1)] dark:drop-shadow-[0_1px_2px_rgb(255_255_255_/_0.1)] inset-s-6 ps-0.5 max-md:sticky @4xl/content:table-cell @4xl/content:drop-shadow-none" colspan="1">
{sort_header('username', 'Username', False)}
									</th>
									<th data-slot="table-head" class="{TH} w-36" colspan="1">
										<div class="">Name</div>
									</th>
									<th data-slot="table-head" data-col="email" class="{TH}" colspan="1">
{sort_header('email', 'Email', True)}
									</th>
									<th data-slot="table-head" data-col="phoneNumber" class="{TH}" colspan="1">
										<div class="">Phone Number</div>
									</th>
									<th data-slot="table-head" class="{TH}" colspan="1">
										<div class="">Status</div>
									</th>
									<th data-slot="table-head" class="{TH}" colspan="1">
										<div class="">Role</div>
									</th>
									<th data-slot="table-head" class="{TH}" colspan="1"></th>
								</tr>
							</thead>
							<tbody data-slot="table-body" class="[&_tr:last-child]:border-0">
{chr(10).join(row_slot(i) for i in range(SLOTS))}
							</tbody>
							<tbody data-slot="table-body" hidden={{hasRows}}>
								<tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
									<td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap *:[[role=checkbox]]:translate-y-0.5 h-24 text-center" colspan="8">No results.</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
				<div class="flex items-center justify-between overflow-clip px-2 @max-2xl/content:flex-col-reverse @max-2xl/content:gap-4 mt-auto" style="overflow-clip-margin: 1px;">
					<div class="flex w-full items-center justify-between">
						<div class="flex w-25 items-center justify-center text-sm font-medium @2xl/content:hidden">{{pageLabel}}</div>
						<div class="flex items-center gap-2 @max-2xl/content:flex-row-reverse">
							<DropdownMenuTrigger menu="page-size" haspopup="listbox" role="combobox" aria-autocomplete="none" dir="ltr" data-size="default" class="{SELECT_TRIGGER}">
								<span data-slot="select-value" style="pointer-events: none;">{{pageSizeLabel}}</span>
								{lucide('ChevronDownIcon', 'size-4 opacity-50')}
							</DropdownMenuTrigger>
							<p class="hidden text-sm font-medium sm:block">Rows per page</p>
						</div>
					</div>
					<div class="flex items-center sm:space-x-6 lg:space-x-8">
						<div class="flex w-25 items-center justify-center text-sm font-medium @max-3xl/content:hidden">{{pageLabel}}</div>
						<div class="flex items-center space-x-2">
							<button data-slot="button" class="{PAGER} @max-md/content:hidden" disabled={{cannotPrevious}} onClick={{() => {{ page = 1; pushSearch({URL_EXPR}); }}}}>
								<span class="sr-only">Go to first page</span>
								{radix('DoubleArrowLeftIcon', 'h-4 w-4')}
							</button>
							<button data-slot="button" class="{PAGER}" disabled={{cannotPrevious}} onClick={{() => {{ page = Math.max(1, page - 1); pushSearch({URL_EXPR}); }}}}>
								<span class="sr-only">Go to previous page</span>
								{radix('ChevronLeftIcon', 'h-4 w-4')}
							</button>
{chr(10).join(page_slot(i) for i in range(PAGE_SLOTS))}
							<button data-slot="button" class="{PAGER}" disabled={{cannotNext}} onClick={{() => {{ page = Math.min(lastPage({INPUT_EXPR}), page + 1); pushSearch({URL_EXPR}); }}}}>
								<span class="sr-only">Go to next page</span>
								{radix('ChevronRightIcon', 'h-4 w-4')}
							</button>
							<button data-slot="button" class="{PAGER} @max-md/content:hidden" disabled={{cannotNext}} onClick={{() => {{ page = lastPage({INPUT_EXPR}); pushSearch({URL_EXPR}); }}}}>
								<span class="sr-only">Go to last page</span>
								{radix('DoubleArrowRightIcon', 'h-4 w-4')}
							</button>
						</div>
					</div>
				</div>
				<div aria-live="polite" aria-atomic="true" class="sr-only" role="status" hidden={{noSelection}}>{{announcement}}</div>
				<div role="toolbar" aria-label={{toolbarLabel}} aria-describedby="bulk-actions-description" tabindex="-1" class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl transition-all delay-100 duration-300 ease-out hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" hidden={{noSelection}} onKeydown={{(event) => {{
					if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {{
						event.preventDefault();
						moveToolbarFocus(event.currentTarget as HTMLElement, event.key);
					}}
					if (event.key === 'Escape') {{
						selected = escapeClears(event) ? '' : selected;
					}}
				}}}}>
					<div class="p-2 shadow-xl rounded-xl border bg-background/95 backdrop-blur-lg supports-backdrop-filter:bg-background/60 flex items-center gap-x-2">
						<button data-slot="button" class="{BTN} {OUTLINE} size-6 rounded-full" aria-label="Clear selection" title="Clear selection (Escape)" data-state="closed" onClick={{() => {{ selected = ''; }}}}>
							{lucide('X', '')}
							<span class="sr-only">Clear selection</span>
						</button>
						<div data-orientation="vertical" role="none" data-slot="separator" class="{SEPARATOR_V} h-5" aria-hidden="true"></div>
						<div class="flex items-center gap-x-1 text-sm" id="bulk-actions-description">
							<span data-slot="badge" class="inline-flex items-center justify-center border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90 min-w-8 rounded-lg" aria-label={{selectedCountLabel}}>{{selectedCount}}</span>
							<span class="hidden sm:inline">{{selectedNoun}}</span>
							<span>selected</span>
						</div>
						<div data-orientation="vertical" role="none" data-slot="separator" class="{SEPARATOR_V} h-5" aria-hidden="true"></div>
{bulk_button('Invite selected users', 'Mail', bulk_handler("'Inviting users...'", f"`Invited ${{count}} user{plural}`", "'Error inviting users'"))}
{bulk_button('Activate selected users', 'UserCheck', bulk_handler("'Activating users...'", f"`Activated ${{count}} user{plural}`", "'Error activating users'"))}
{bulk_button('Deactivate selected users', 'UserX', bulk_handler("'Deactivating users...'", f"`Deactivated ${{count}} user{plural}`", "'Error deactivating users'"))}
{bulk_button('Delete selected users', 'Trash2', '() => {}', True)}
					</div>
				</div>
			</div>
		</main>
		<div data-state={{deleteState}} data-slot="alert-dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" style="pointer-events: auto;" hidden={{deleteClosed}}></div>
		<div role="alertdialog" id="users-delete-dialog" aria-describedby="users-delete-description" aria-labelledby="users-delete-title" data-state={{deleteState}} data-slot="alert-dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg" tabindex="-1" style="pointer-events: auto;" hidden={{deleteClosed}} onKeydown={{(event) => {{
			if (event.key === 'Escape') {{
				event.preventDefault();
				deleteOpen = false;
				closeConfirm();
			}}
		}}}}>
			<div data-slot="alert-dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="users-delete-title" data-slot="alert-dialog-title" class="text-lg font-semibold">
					<span class="text-destructive">
						{lucide('AlertTriangle', 'me-1 inline-block stroke-destructive', 18)}
						{{' '}}Delete User
					</span>
				</h2>
				<div id="users-delete-description" data-slot="alert-dialog-description" class="text-sm text-muted-foreground">
					<form id="users-delete-form" class="space-y-4" onSubmit={{(event) => {{
						event.preventDefault();
						if (deleteValue.trim() === deleteName) {{
							deleteOpen = false;
							closeConfirm();
							const id = `deleted-${{Date.now()}}`;
							toasts = message(toasts, id, 'The following user has been deleted:', deleteSummary(userAt({INPUT_EXPR}, rowSlot(m.at))));
							setTimeout(() => {{
								toasts = expired(toasts, id);
							}}, DURATION);
						}}
					}}}}>
						<p class="mb-2">
							<span>Are you sure you want to delete </span>
							<span class="font-bold">{{deleteName}}</span>
							<span>?</span>
							<span class="block"></span>
							<span>This action will permanently remove the user with the role of </span>
							<span class="font-bold">{{deleteRoleUpper}}</span>
							<span> from the system. This cannot be undone.</span>
						</p>
						<label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 my-2">
							Username:
							<input data-slot="input" id="users-delete-input" class="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40" placeholder="Enter username to confirm deletion." value={{deleteValue}} onInput={{(event) => {{ deleteValue = (event.target as HTMLInputElement).value; }}}} />
						</label>
						<div data-slot="alert" role="alert" class="relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90">
							<div data-slot="alert-title" class="col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight">Warning!</div>
							<div data-slot="alert-description" class="col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed">Please be careful, this operation can not be rolled back.</div>
						</div>
					</form>
				</div>
			</div>
			<div data-slot="alert-dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" class="{BTN} {OUTLINE} h-9 px-4 py-2 has-[>svg]:px-3" onClick={{() => {{ deleteOpen = false; closeConfirm(); }}}}>Cancel</button>
				<button data-slot="button" class="{BTN.replace(' focus-visible:ring-ring/50', '')} bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 h-9 px-4 py-2 has-[>svg]:px-3" type="submit" form="users-delete-form" disabled={{deleteDisabled}}>Delete</button>
			</div>
		</div>
{facet_content('status', 'Status', STATUS)}
{facet_content('role', 'Role', ROLES)}
{sort_content('username', False)}
{sort_content('email', True)}
	<DropdownMenuContent menu="view-options" modal={{false}} align="end" class="w-37.5">
		<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
		<DropdownMenuSeparator />
		<DropdownMenuCheckboxItem menu="view-options" class="capitalize" checked={{emailShown}} onSelect={{() => {{ hidden = toggleValue(hidden, 'email'); }}}}>email</DropdownMenuCheckboxItem>
		<DropdownMenuCheckboxItem menu="view-options" class="capitalize" checked={{phoneShown}} onSelect={{() => {{ hidden = toggleValue(hidden, 'phoneNumber'); }}}}>phoneNumber</DropdownMenuCheckboxItem>
	</DropdownMenuContent>
	<DropdownMenuContent menu="row-actions" modal={{false}} align="end" class="w-40">
		<DropdownMenuItem menu="row-actions" onSelect={{() => {{}}}}>
			Edit
			<DropdownMenuShortcut>{lucide('UserPen', '', 16)}</DropdownMenuShortcut>
		</DropdownMenuItem>
		<DropdownMenuSeparator />
		<DropdownMenuItem menu="row-actions" class="text-red-500!" onSelect={{() => {{
			const user = userAt({INPUT_EXPR}, rowSlot(m.at));
			deleteName = user ? user.username : '';
			deleteRole = user ? user.role : '';
			deleteValue = '';
			deleteOpen = true;
			openConfirm();
		}}}}>
			Delete
			<DropdownMenuShortcut>{lucide('Trash2', '', 16)}</DropdownMenuShortcut>
		</DropdownMenuItem>
	</DropdownMenuContent>
	<DropdownMenuContent menu="page-size" role="listbox" slot="select-content" side="top" align="start" class="{SELECT_CONTENT}">
		<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">
			<SelectItem menu="page-size" selected={{size10}} onSelect={{() => {{ page = Math.floor(((page - 1) * pageSize) / 10) + 1; pageSize = 10; pushSearch({URL_EXPR}); }}}}>10</SelectItem>
			<SelectItem menu="page-size" selected={{size20}} onSelect={{() => {{ page = Math.floor(((page - 1) * pageSize) / 20) + 1; pageSize = 20; pushSearch({URL_EXPR}); }}}}>20</SelectItem>
			<SelectItem menu="page-size" selected={{size30}} onSelect={{() => {{ page = Math.floor(((page - 1) * pageSize) / 30) + 1; pageSize = 30; pushSearch({URL_EXPR}); }}}}>30</SelectItem>
			<SelectItem menu="page-size" selected={{size40}} onSelect={{() => {{ page = Math.floor(((page - 1) * pageSize) / 40) + 1; pageSize = 40; pushSearch({URL_EXPR}); }}}}>40</SelectItem>
			<SelectItem menu="page-size" selected={{size50}} onSelect={{() => {{ page = Math.floor(((page - 1) * pageSize) / 50) + 1; pageSize = 50; pushSearch({URL_EXPR}); }}}}>50</SelectItem>
		</div>
	</DropdownMenuContent>
		<Toaster toasts={{toasts}} extra={{true}} />
	</Shell>
}}
"""
    with open(os.path.join(APP, 'pages/users.tsrx'), 'w') as f:
        f.write(out)
    print('pages/users.tsrx', out.count('\n'), 'lines')


main()
