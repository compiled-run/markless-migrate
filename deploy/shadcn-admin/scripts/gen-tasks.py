# Writes examples/shadcn-admin-markless/pages/tasks.tsrx from tasks.template.tsrx: expands the icon tokens
# (%%ICON:name:classes%%, the old app's rendered SVGs in tasks-icons.json) and the per-column macros, so the
# faceted filters and sortable headers are written once.
#   python3 gen-tasks.py [out]
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = json.load(open(os.path.join(HERE, 'tasks-icons.json')))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '../../../examples/shadcn-admin-markless/pages/tasks.tsrx')


def icon(name, classes):
	svg = ICONS[name]
	return svg.replace(' class="%CLASS%"', f' class="{classes}"' if classes else '')


def hidden_icon(name, classes, test):
	return icon(name, classes).replace('<svg ', f'<svg hidden={{{test}}} ', 1)


def expand_icons(text):
	return re.sub(r'%%ICON:([a-z0-9-]+):([^%]*)%%', lambda m: icon(m.group(1), m.group(2)), text)


STATUS_ICONS = {'backlog': 'circle-question-mark', 'todo': 'circle', 'in progress': 'timer', 'done': 'circle-check-big', 'canceled': 'circle-off'}
PRIORITY_ICONS = {'low': 'arrow-down', 'medium': 'arrow-right', 'high': 'arrow-up', 'critical': 'circle-alert'}


def icon_chain(var, icons, classes):
	"""Every icon for the value in `var`, all but the matching one hidden: an @if inside an @for row stops the page updating."""
	return '\n'.join(hidden_icon(name, classes, f"{var} !== '{value}'") for value, name in icons.items())


def facet_trigger(key, title):
	return f'''<DropdownMenuTrigger menu="filter-{key}" haspopup="dialog" slot="popover-trigger" class={{facetTriggerClass}}>
	%%ICON:plus-circled:size-4%%
	{title}
	<div data-orientation="vertical" role="none" data-slot="separator" class={{`${{SEPARATOR_V}} mx-2 h-4`}} hidden={{{key}None}}></div>
	<span data-slot="badge" class={{badge('rounded-sm px-1 font-normal lg:hidden')}} hidden={{{key}None}}>{{{key}Count}}</span>
	<div class="hidden space-x-1 lg:flex" hidden={{{key}None}}>
		<span data-slot="badge" class={{badge('rounded-sm px-1 font-normal')}} hidden={{{key}FewOrNone}}>{{{key}CountLabel}}</span>
		@for (const option of {key}Options; key option.value) {{
			<span data-slot="badge" class={{badge('rounded-sm px-1 font-normal')}} hidden={{!option.selected || !{key}FewOrNone}}>{{option.label}}</span>
		}}
	</div>
</DropdownMenuTrigger>'''


def facet_popover(key, title, icons):
	chain = icon_chain('option.value', icons, 'size-4 text-muted-foreground').replace('\n', '\n\t\t\t\t\t\t\t')
	return f'''<PopoverContent menu="filter-{key}" align="start" class="w-50 p-0">
	<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground" cmdk-root="" id="filter-{key}-command" onKeydown={{(event) => {{
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {{
			moveIn(document.getElementById('filter-{key}-command'), event.key);
		}}
		const option = event.key === 'Enter' ? chosenIn(document.getElementById('filter-{key}-command')) : undefined;
		if (option) {{
			{key} = option === 'clear' ? '' : toggleValue({key}, option);
			page = 1;
			pushFilters(status, priority);
		}}
	}}}}>
		<label cmdk-label="" for="filter-{key}-input" id="filter-{key}-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
		<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
			%%ICON:search:size-4 shrink-0 opacity-50%%
			<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" placeholder="{title}" cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="filter-{key}-list" aria-labelledby="filter-{key}-label" id="filter-{key}-input" type="text" value="" onInput={{(event) => filterIn(document.getElementById('filter-{key}-command'), (event.target as HTMLInputElement).value)}} />
		</div>
		<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="filter-{key}-list" onClick={{(event) => {{
			selectPressed(event.target);
			const option = chosenIn(document.getElementById('filter-{key}-command'), event.target);
			if (option) {{
				{key} = option === 'clear' ? '' : toggleValue({key}, option);
				page = 1;
				pushFilters(status, priority);
			}}
		}}}}>
			<div cmdk-list-sizer="">
				<div cmdk-empty="" role="presentation" data-slot="command-empty" class="py-6 text-center text-sm" hidden>No results found.</div>
				<div data-slot="command-group" class={{COMMAND_GROUP}} cmdk-group="" role="presentation" data-value="undefined">
					<div cmdk-group-items="" role="group">
						@for (const option of {key}Options; key option.value) {{
							<div data-slot="command-item" class={{COMMAND_ITEM}} id={{`filter-{key}-${{option.value.replace(' ', '-')}}`}} cmdk-item="" role="option" aria-disabled="false" data-disabled="false" data-value={{option.label + option.count}} data-option={{option.value}}>
								<div class={{option.selected ? 'flex size-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground' : 'flex size-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible'}}>
									%%ICON:check-radix:h-4 w-4 text-background%%
								</div>
								{chain}
								<span>{{option.label}}</span>
								<span class="ms-auto flex h-4 w-4 items-center justify-center font-mono text-xs" hidden={{option.count === ''}}>{{option.count}}</span>
							</div>
						}}
					</div>
				</div>
				<div data-slot="command-separator" class="-mx-1 h-px bg-border" cmdk-separator={{{key}None ? undefined : ''}} role="separator" hidden={{{key}None}}></div>
				<div data-slot="command-group" class={{COMMAND_GROUP}} cmdk-group="" role="presentation" data-value="undefined" hidden={{{key}None}}>
					<div cmdk-group-items="" role="group">
						<div data-slot="command-item" class={{`${{COMMAND_ITEM}} justify-center text-center`}} id="filter-{key}-clear" cmdk-item={{{key}None ? undefined : ''}} role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value="Clear filters" data-option="clear">Clear filters</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</PopoverContent>'''


def sort_header(key, title, extra_class):
	return f'''<th data-slot="table-head" class={{`${{TH}}{extra_class}`}} colspan="1" hidden={{{key}ColumnHidden}}>
		<div class="flex items-center space-x-2">
			<DropdownMenuTrigger menu="sort-{key}" class={{sortTriggerClass}}>
				<span>{title}</span>
				{hidden_icon('arrow-down-radix', 'ms-2 h-4 w-4', f"sorting !== '{key}:desc'")}
				{hidden_icon('arrow-up-radix', 'ms-2 h-4 w-4', f"sorting !== '{key}:asc'")}
				{hidden_icon('caret-sort', 'ms-2 h-4 w-4', f"sorting === '{key}:asc' || sorting === '{key}:desc'")}
			</DropdownMenuTrigger>
		</div>
</th>'''


def sort_menu(key):
	return f'''<DropdownMenuContent menu="sort-{key}" align="start">
	<DropdownMenuItem menu="sort-{key}" onSelect={{() => {{ sorting = '{key}:asc'; }}}}>
		%%ICON:arrow-up-radix:size-3.5 text-muted-foreground/70%%
		Asc
	</DropdownMenuItem>
	<DropdownMenuItem menu="sort-{key}" onSelect={{() => {{ sorting = '{key}:desc'; }}}}>
		%%ICON:arrow-down-radix:size-3.5 text-muted-foreground/70%%
		Desc
	</DropdownMenuItem>
	<DropdownMenuSeparator />
	<DropdownMenuItem menu="sort-{key}" onSelect={{() => {{ hidden = hasValue(hidden, '{key}') ? hidden : toggleValue(hidden, '{key}'); }}}}>
		%%ICON:eye-none:size-3.5 text-muted-foreground/70%%
		Hide
	</DropdownMenuItem>
</DropdownMenuContent>'''


def indent_block(block, prefix):
	return block.replace('\n', '\n' + prefix)


STATUSES = [('Backlog', 'backlog'), ('Todo', 'todo'), ('In Progress', 'in progress'), ('Done', 'done'), ('Canceled', 'canceled')]
PRIORITIES = [('Low', 'low'), ('Medium', 'medium'), ('High', 'high'), ('Critical', 'critical')]
SELECT = [('In Progress', 'in progress', 'InProgress'), ('Backlog', 'backlog', 'Backlog'), ('Todo', 'todo', 'Todo'), ('Canceled', 'canceled', 'Canceled'), ('Done', 'done', 'Done')]


def bulk_items(menu, options, icons, noun):
	out = []
	for label, value in options:
		out.append(f'''<DropdownMenuItem menu="{menu}" defaultValue="{value}" onSelect={{() => {{
	const n = count;
	const id = `{menu}-${{Date.now()}}`;
	toasts = promiseLoading(toasts, id, 'Updating {noun.lower()}...');
	selected = '';
	setTimeout(() => {{
		toasts = promiseSuccess(toasts, id, `{noun} updated to "{value}" for ${{n}} task${{n > 1 ? 's' : ''}}.`);
		setTimeout(() => {{ toasts = expired(toasts, id); }}, DURATION);
	}}, 2000);
}}}}>
	{icon(icons[value], 'size-4 text-muted-foreground')}
	{label}
</DropdownMenuItem>''')
	return '\n'.join(out)


def select_items():
	return '\n'.join(f'''<SelectItem menu="tasks-form-status" selected={{status{key}Selected}} onSelect={{() => {{ values.status = '{value}'; errors = revalidate(form, submitted, values, errors); }}}}>{label}</SelectItem>''' for label, value, key in SELECT)


text = open(os.path.join(HERE, 'tasks.template.tsrx')).read()
macros = {
	'FACET_TRIGGER:status': facet_trigger('status', 'Status'),
	'FACET_TRIGGER:priority': facet_trigger('priority', 'Priority'),
	'FACET_POPOVER:status': facet_popover('status', 'Status', STATUS_ICONS),
	'FACET_POPOVER:priority': facet_popover('priority', 'Priority', PRIORITY_ICONS),
	'SORT_HEADER:title': sort_header('title', 'Title', ' ps-1 max-w-0 w-2/3'),
	'SORT_HEADER:status': sort_header('status', 'Status', ' ps-1'),
	'SORT_HEADER:priority': sort_header('priority', 'Priority', ' ps-1'),
	'SORT_MENU:title': sort_menu('title'),
	'SORT_MENU:status': sort_menu('status'),
	'SORT_MENU:priority': sort_menu('priority'),
	'ROW_STATUS_ICON': icon_chain('r.status', STATUS_ICONS, 'size-4 text-muted-foreground'),
	'ROW_PRIORITY_ICON': icon_chain('r.priority', PRIORITY_ICONS, 'size-4 text-muted-foreground'),
	'BULK_STATUS_ITEMS': bulk_items('bulk-status', STATUSES, STATUS_ICONS, 'Status'),
	'BULK_PRIORITY_ITEMS': bulk_items('bulk-priority', PRIORITIES, PRIORITY_ICONS, 'Priority'),
	'STATUS_SELECT_ITEMS': select_items(),
}


def macro(m):
	prefix, name = m.group(1), m.group(2)
	return prefix + indent_block(macros[name], prefix)


text = re.sub(r'^([ \t]*)%%MACRO:([A-Z_]+(?::[a-z]+)?)%%', macro, text, flags=re.M)
open(OUT, 'w').write(expand_icons(text))
print(f'wrote {OUT}')
