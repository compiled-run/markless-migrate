#!/usr/bin/env python3
"""Writes examples/shadcn-admin-markless/components/users/users-dialogs.tsrx: the users page's add/edit and invite
dialogs (features/users/components/users-action-dialog.tsx, users-invite-dialog.tsx), markup from the old app's
rendered DOM. The page opens them (gen-users.py) through the page-scoped usersDialogs() cells.
Usage: python3 gen-users-dialogs.py"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.environ.get('APP') or os.path.join(HERE, '../../../examples/shadcn-admin-markless')

BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
PRIMARY = 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'
OUTLINE = 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'
OVERLAY = 'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0'
CONTENT = 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
LABEL = 'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive'
INPUT = 'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40'
PASSWORD = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50'
EYE_BUTTON = BTN.replace(' rounded-md', '') + ' hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 absolute inset-e-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground'
SELECT_TRIGGER = "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"
SELECT_CONTENT = 'relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1'
TEXTAREA = 'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40 resize-none'
CLOSE_X = "absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
NATIVE_SELECT = 'position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;'
ROLES = [('superadmin', 'Superadmin'), ('admin', 'Admin'), ('manager', 'Manager'), ('cashier', 'Cashier')]

CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down size-4 opacity-50" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>'
X_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>'
EYE = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>'
EYE_OFF = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>'
MAIL_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail-plus" aria-hidden="true"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="M19 16v6" /><path d="M16 19h6" /></svg>'
SEND = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>'

# (form state key, errors key, submitted key, resolver, form id, field id prefix)
ACTION = ('form', 'errors', 'submitted', 'userFormErrors', 'user-form')
INVITE = ('invite', 'inviteErrors', 'inviteSubmitted', 'inviteFormErrors', 'user-invite-form')


def cap(s):
    return s[0].upper() + s[1:]


def var(spec, name):
    return ('invite' if spec is INVITE else 'user') + cap(name)


def field_computeds(spec, name):
    _, errors, _, _, form_id = spec
    v = var(spec, name)
    base = f'{form_id}-{name}'
    return '\n'.join([
        f"\tconst {v}Error = computed(() => errorOf(d.{errors}, '{name}'));",
        f"\tconst {v}Invalid = computed(() => (errorOf(d.{errors}, '{name}') ? 'true' : 'false'));",
        f"\tconst {v}DescribedBy = computed(() => (errorOf(d.{errors}, '{name}') ? '{base}-description {base}-message' : '{base}-description'));",
    ])


def write_value(spec, name, value):
    form, errors, submitted, resolver, _ = spec
    field = resolver.replace('FormErrors', 'FieldErrors')
    return (f'const next = {{ ...d.{form}, {name}: {value} }}; d.{form} = next; '
            f"if (d.{submitted}) d.{errors} = {field}(d.{errors}, next, '{name}');")


def message(spec, name, extra):
    _, _, _, _, form_id = spec
    v = var(spec, name)
    return (f'\t\t\t\t\t@if ({v}Error) {{\n'
            f'\t\t\t\t\t\t<p data-slot="form-message" id="{form_id}-{name}-message" class="text-sm text-destructive{extra}">{{{v}Error}}</p>\n'
            '\t\t\t\t\t}')


def label(spec, name, text, extra, target=None):
    _, _, _, _, form_id = spec
    return f'\t\t\t\t\t<label data-slot="form-label" class="{LABEL}{extra}" data-error={{{var(spec, name)}Invalid}} for="{target or f"{form_id}-{name}"}">{text}</label>'


def text_input(spec, name, placeholder, extra, autocomplete_off=False, kind='input', type_=None):
    form, _, _, _, form_id = spec
    v = var(spec, name)
    attrs = f' placeholder="{placeholder}"' + (' autocomplete="off"' if autocomplete_off else '')
    element = 'HTMLTextAreaElement' if kind == 'textarea' else 'HTMLInputElement'
    handler = 'onInput={(event) => { ' + write_value(spec, name, f'(event.target as {element}).value') + ' }}'
    common = f'id="{form_id}-{name}" aria-describedby={{{v}DescribedBy}} aria-invalid={{{v}Invalid}}'
    if kind == 'textarea':
        return f'\t\t\t\t\t<textarea data-slot="form-control" class="{TEXTAREA}"{attrs} name="{name}" {common} value={{d.{form}.{name}}} {handler}></textarea>'
    t = f' type="{type_}"' if type_ else ''
    return f'\t\t\t\t\t<input data-slot="form-control" class="{INPUT}{extra}"{t}{attrs} {common} value={{d.{form}.{name}}} name="{name}" {handler} />'


def password_input(spec, name, show, disabled_expr=None):
    form, _, _, _, form_id = spec
    v = var(spec, name)
    dis = f' disabled={{{disabled_expr}}}' if disabled_expr else ''
    return '\n'.join([
        '\t\t\t\t\t<div class="relative rounded-md col-span-4">',
        f'\t\t\t\t\t\t<input class="{PASSWORD}"{dis} placeholder="e.g., S3cur3P@ssw0rd" data-slot="form-control" id="{form_id}-{name}" aria-describedby={{{v}DescribedBy}} aria-invalid={{{v}Invalid}} type={{{v}Type}} value={{d.{form}.{name}}} name="{name}" onInput={{(event) => {{ ' + write_value(spec, name, '(event.target as HTMLInputElement).value') + ' }} />',
        f'\t\t\t\t\t\t<button data-slot="button" class="{EYE_BUTTON}" type="button"{dis} onClick={{() => (d.{show} = !d.{show})}}>',
        f'\t\t\t\t\t\t\t@if (d.{show}) {{',
        f'\t\t\t\t\t\t\t\t{EYE}',
        '\t\t\t\t\t\t\t} @else {',
        f'\t\t\t\t\t\t\t\t{EYE_OFF}',
        '\t\t\t\t\t\t\t}',
        f'\t\t\t\t\t\t\t<span class="sr-only">{{{v}Toggle}}</span>',
        '\t\t\t\t\t\t</button>',
        '\t\t\t\t\t</div>',
    ])


def role_select(spec, menu, extra):
    form, _, _, _, form_id = spec
    v = var(spec, 'role')
    return '\n'.join([
        f'\t\t\t\t\t<button el={{m.triggers}} data-menu="{menu}" type="button" role="combobox" aria-controls="radix-menu-{menu}-content" aria-expanded={{{v}Expanded}} aria-autocomplete="none" dir="ltr" data-state={{{v}MenuState}} data-placeholder={{{v}Placeholder}} data-slot="form-control" data-size="default" class="{SELECT_TRIGGER}{extra}" id="radix-menu-{menu}-trigger" aria-describedby={{{v}DescribedBy}} aria-invalid={{{v}Invalid}}',
        '\t\t\t\t\t\tonPointerdown={(event) => {',
        '\t\t\t\t\t\t\tif (event.button === 0) {',
        '\t\t\t\t\t\t\t\tevent.preventDefault();',
        f"\t\t\t\t\t\t\t\tm.open = m.open === '{menu}' ? '' : '{menu}';",
        "\t\t\t\t\t\t\t\tm.at = '';",
        f"\t\t\t\t\t\t\t\ttoggleMenu(m.contents, m.triggers, '{menu}', m.open === '', event.target, (refocus) => {{ m.open = ''; closeMenu(m.contents, m.triggers, '{menu}', refocus); }});",
        f"\t\t\t\t\t\t\t\tfocusOption('{menu}');",
        '\t\t\t\t\t\t\t}',
        '\t\t\t\t\t\t}}',
        '\t\t\t\t\t\tonKeydown={(event) => {',
        "\t\t\t\t\t\t\tif (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {",
        '\t\t\t\t\t\t\t\tevent.preventDefault();',
        f"\t\t\t\t\t\t\t\tm.open = '{menu}';",
        "\t\t\t\t\t\t\t\tm.at = '';",
        f"\t\t\t\t\t\t\t\topenMenu(m.contents, m.triggers, '{menu}', 'first', (refocus) => {{ m.open = ''; closeMenu(m.contents, m.triggers, '{menu}', refocus); }}, event.target);",
        f"\t\t\t\t\t\t\t\tfocusOption('{menu}');",
        '\t\t\t\t\t\t\t}',
        '\t\t\t\t\t\t}}',
        '\t\t\t\t\t>',
        f'\t\t\t\t\t\t<span data-slot="select-value" style="pointer-events: none;">{{{v}Label}}</span>',
        f'\t\t\t\t\t\t{CHEVRON}',
        '\t\t\t\t\t</button>',
        f'\t\t\t\t\t<select aria-hidden="true" tabindex="-1" style="{NATIVE_SELECT}">',
        *[f'\t\t\t\t\t\t<option value="{value}">{text}</option>' for value, text in ROLES],
        '\t\t\t\t\t</select>',
    ])


def role_computeds(spec, menu):
    form = spec[0]
    v = var(spec, 'role')
    lines = [
        f"\tconst {v}Label = computed(() => (d.{form}.role === '' ? 'Select a role' : roleLabel(d.{form}.role)));",
        f"\tconst {v}Placeholder = computed(() => (d.{form}.role === '' ? '' : undefined));",
        f"\tconst {v}Expanded = computed(() => (m.open === '{menu}' ? 'true' : 'false'));",
        f"\tconst {v}MenuState = computed(() => (m.open === '{menu}' ? 'open' : 'closed'));",
    ]
    lines += [f"\tconst {v}Is{cap(value)} = computed(() => (d.{form}.role === '{value}' ? 'true' : 'false'));" for value, _ in ROLES]
    return '\n'.join(lines)


def role_content(spec, menu):
    v = var(spec, 'role')
    items = '\n'.join(
        f"\t\t\t\t<SelectItem menu=\"{menu}\" selected={{{v}Is{cap(value)}}} onSelect={{() => {{ {write_value(spec, 'role', repr(value))} }}}}>{text}</SelectItem>"
        for value, text in ROLES)
    return '\n'.join([
        f'\t\t<DropdownMenuContent menu="{menu}" role="listbox" slot="select-content" align="start" class="{SELECT_CONTENT}">',
        '\t\t\t<div data-radix-select-viewport="" role="presentation" class="p-1 h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1" style="position: relative; flex: 1 1 0%; overflow: hidden auto;">',
        items,
        '\t\t\t</div>',
        '\t\t</DropdownMenuContent>',
    ])


def item(spec, name, body, cls):
    return f'\t\t\t\t<div data-slot="form-item" class="{cls}">\n{body}\n\t\t\t\t</div>'


GRID = 'gap-2 grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'
A_LBL = ' col-span-2 text-end'
A_MSG = ' col-span-4 col-start-3'


def action_dialog():
    a = ACTION
    texts = [('firstName', 'First Name', 'John', True), ('lastName', 'Last Name', 'Doe', True), ('username', 'Username', 'john_doe', False), ('email', 'Email', 'john.doe@gmail.com', False), ('phoneNumber', 'Phone Number', '+123456789', False)]
    computeds = [field_computeds(a, n) for n in [t[0] for t in texts] + ['role', 'password', 'confirmPassword']]
    items = [item(a, n, '\n'.join([label(a, n, t, A_LBL), text_input(a, n, ph, ' col-span-4', off), message(a, n, A_MSG)]), GRID) for n, t, ph, off in texts]
    items.append(item(a, 'role', '\n'.join([label(a, 'role', 'Role', A_LBL, 'radix-menu-user-role-trigger'), role_select(a, 'user-role', ' col-span-4'), message(a, 'role', A_MSG)]), GRID))
    items.append(item(a, 'password', '\n'.join([label(a, 'password', 'Password', A_LBL), password_input(a, 'password', 'showPassword'), message(a, 'password', A_MSG)]), GRID))
    items.append(item(a, 'confirmPassword', '\n'.join([label(a, 'confirmPassword', 'Confirm Password', A_LBL), password_input(a, 'confirmPassword', 'showConfirm', 'userConfirmDisabled'), message(a, 'confirmPassword', A_MSG)]), GRID))
    return f"""export function UsersActionDialog() @{{
	const d = usersDialogs();
	const m = menus();
	const userClosed = computed(() => d.open !== 'add' && d.open !== 'edit');
	const userState = computed(() => (d.open === 'add' || d.open === 'edit' ? 'open' : 'closed'));
	const userTitle = computed(() => (d.form.isEdit ? 'Edit User' : 'Add New User'));
	const userLead = computed(() => (d.form.isEdit ? 'Update the user here. ' : 'Create new user here. '));
	const userConfirmDisabled = computed(() => d.form.password === '');
	const userPasswordType = computed(() => (d.showPassword ? 'text' : 'password'));
	const userPasswordToggle = computed(() => (d.showPassword ? 'Hide password' : 'Show password'));
	const userConfirmPasswordType = computed(() => (d.showConfirm ? 'text' : 'password'));
	const userConfirmPasswordToggle = computed(() => (d.showConfirm ? 'Hide password' : 'Show password'));
{chr(10).join(computeds)}
{role_computeds(a, 'user-role')}

	<div class="contents">
		<div data-state={{userState}} data-slot="dialog-overlay" class="{OVERLAY}" style="pointer-events: auto;" hidden={{userClosed}}></div>
		<div role="dialog" id="users-action-dialog" aria-describedby="users-action-description" aria-labelledby="users-action-title" data-state={{userState}} data-slot="dialog-content" class="{CONTENT} sm:max-w-lg" tabindex="-1" style="pointer-events: auto;" hidden={{userClosed}}>
			<div data-slot="dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="users-action-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">{{userTitle}}</h2>
				<p id="users-action-description" data-slot="dialog-description" class="text-sm text-muted-foreground">{{userLead}}Click save when you're done.</p>
			</div>
			<div class="h-105 w-[calc(100%+0.75rem)] overflow-y-auto py-1 pe-3">
				<form id="user-form" class="space-y-4 px-0.5" onSubmit={{(event) => {{
					event.preventDefault();
					const values = d.form;
					const errors = userFormErrors(values);
					d.submitted = true;
					d.errors = errors;
					if (errors !== '{{}}') {{
						focusFirstError('user-form', errors, USER_FOCUS_ORDER);
						return;
					}}
					const id = `user-${{Date.now()}}`;
					d.toasts = message(d.toasts, id, 'You submitted the following values:', submittedUser(values));
					d.open = '';
					closeDialog('users-action-dialog', false);
					setTimeout(() => {{
						d.toasts = expired(d.toasts, id);
					}}, DURATION);
				}}}}>
{chr(10).join(items)}
				</form>
			</div>
			<div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button data-slot="button" class="{BTN} {PRIMARY}" type="submit" form="user-form">Save changes</button>
			</div>
			<button type="button" data-slot="dialog-close" class="{CLOSE_X}" onClick={{() => {{ d.open = ''; closeDialog('users-action-dialog', false); }}}}>
				{X_ICON}
				<span class="sr-only">Close</span>
			</button>
		</div>
{role_content(a, 'user-role')}
	</div>
}}
"""


def invite_dialog():
    i = INVITE
    computeds = [field_computeds(i, n) for n in ['email', 'role', 'desc']]
    items = [
        item(i, 'email', '\n'.join([label(i, 'email', 'Email', ''), text_input(i, 'email', 'eg: john.doe@gmail.com', '', type_='email'), message(i, 'email', '')]), 'grid gap-2'),
        item(i, 'role', '\n'.join([label(i, 'role', 'Role', '', 'radix-menu-invite-role-trigger'), role_select(i, 'invite-role', ''), message(i, 'role', '')]), 'grid gap-2'),
        item(i, 'desc', '\n'.join([label(i, 'desc', 'Description (optional)', ''), text_input(i, 'desc', 'Add a personal note to your invitation (optional)', '', kind='textarea'), message(i, 'desc', '')]), 'grid gap-2'),
    ]
    return f"""export function UsersInviteDialog() @{{
	const d = usersDialogs();
	const m = menus();
	const inviteClosed = computed(() => d.open !== 'invite');
	const inviteState = computed(() => (d.open === 'invite' ? 'open' : 'closed'));
{chr(10).join(computeds)}
{role_computeds(i, 'invite-role')}

	<div class="contents">
		<div data-state={{inviteState}} data-slot="dialog-overlay" class="{OVERLAY}" style="pointer-events: auto;" hidden={{inviteClosed}}></div>
		<div role="dialog" id="users-invite-dialog" aria-describedby="users-invite-description" aria-labelledby="users-invite-title" data-state={{inviteState}} data-slot="dialog-content" class="{CONTENT} sm:max-w-md" tabindex="-1" style="pointer-events: auto;" hidden={{inviteClosed}}>
			<div data-slot="dialog-header" class="flex flex-col gap-2 sm:text-start text-start">
				<h2 id="users-invite-title" data-slot="dialog-title" class="text-lg leading-none font-semibold flex items-center gap-2">
					{MAIL_PLUS}
					{{' '}}Invite User
				</h2>
				<p id="users-invite-description" data-slot="dialog-description" class="text-sm text-muted-foreground">Invite new user to join your team by sending them an email invitation. Assign a role to define their access level.</p>
			</div>
			<form id="user-invite-form" class="space-y-4" onSubmit={{(event) => {{
				event.preventDefault();
				const values = d.invite;
				const errors = inviteFormErrors(values);
				d.inviteSubmitted = true;
				d.inviteErrors = errors;
				if (errors !== '{{}}') {{
					focusFirstError('user-invite-form', errors, INVITE_FOCUS_ORDER);
					return;
				}}
				const id = `invite-${{Date.now()}}`;
				d.toasts = message(d.toasts, id, 'You submitted the following values:', submittedInvite(values));
				d.open = '';
				closeDialog('users-invite-dialog', false);
				setTimeout(() => {{
					d.toasts = expired(d.toasts, id);
				}}, DURATION);
			}}}}>
{chr(10).join(items).replace(chr(10) + chr(9) * 4, chr(10) + chr(9) * 3).replace(chr(9) * 4 + '<div data-slot="form-item"', chr(9) * 3 + '<div data-slot="form-item"')}
			</form>
			<div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end gap-y-2">
				<button data-slot="dialog-close" class="{BTN} {OUTLINE}" type="button" onClick={{() => {{ d.open = ''; closeDialog('users-invite-dialog', false); }}}}>Cancel</button>
				<button data-slot="button" class="{BTN} {PRIMARY}" type="submit" form="user-invite-form">
					Invite{{' '}}
					{SEND}
				</button>
			</div>
			<button type="button" data-slot="dialog-close" class="{CLOSE_X}" onClick={{() => {{ d.open = ''; closeDialog('users-invite-dialog', false); }}}}>
				{X_ICON}
				<span class="sr-only">Close</span>
			</button>
		</div>
{role_content(i, 'invite-role')}
	</div>
}}
"""


def main():
    out = f"""// The users page's add/edit and invite dialogs (features/users/components/users-action-dialog.tsx, users-invite-dialog.tsx).
// Written by deploy/shadcn-admin/scripts/gen-users-dialogs.py from the old app's rendered DOM; the page opens them.
import {{ computed, shared, state }} from '@markless/core';
import {{ closeDialog }} from '../../lib/parity/radix-ui-react-dialog/behaviour.ts';
import {{ closeMenu, openMenu, toggleMenu }} from '../../lib/parity/radix-ui-react-dropdown-menu/behaviour.ts';
import {{ DropdownMenuContent, menus, SelectItem }} from '../../lib/parity/radix-ui-react-dropdown-menu/menu.tsrx';
import {{ DURATION, expired, message, type Toast }} from '../../lib/parity/sonner/index.ts';
import {{ errorOf, focusFirstError, focusOption, inviteFieldErrors, inviteForm, inviteFormErrors, roleLabel, submittedInvite, submittedUser, userFieldErrors, userForm, userFormErrors }} from '../../lib/users-behaviour.ts';

const USER_FOCUS_ORDER = ['firstName', 'lastName', 'username', 'email', 'phoneNumber', 'password', 'confirmPassword'];
const INVITE_FOCUS_ORDER = ['email', 'desc'];

export const usersDialogs = shared(
	() => {{
		const cells = state({{ open: '', form: userForm(), submitted: false, errors: '{{}}', showPassword: false, showConfirm: false, invite: inviteForm(), inviteSubmitted: false, inviteErrors: '{{}}', toasts: [] as Toast[] }});
		return {{ ...cells }};
	}},
	{{ scope: 'page' }},
);

{action_dialog()}
{invite_dialog()}"""
    path = os.path.join(APP, 'components/users/users-dialogs.tsrx')
    with open(path, 'w') as f:
        f.write(out)
    print('components/users/users-dialogs.tsrx', out.count('\n'), 'lines')


main()
