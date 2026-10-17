# Builds examples/shadcn-admin-markless/components/layout/shell.tsrx from the old app's rendered sidebar and
# header (captured with dom-to-tsrx.mjs), inserting the Markless bindings. Run after capturing:
#   node dom-to-tsrx.mjs <old>/ '[data-slot=sidebar]' --click 'button:has-text("Secured by Clerk")' ... > /tmp/p-sidebar-open.tsrx
import re, sys

def indent(text, n):
    return '\n'.join(('\t' * n + l) if l.strip() else l for l in text.split('\n'))

side = open('/tmp/p-sidebar-open.tsrx').read().rstrip('\n')
groups = {'radix-_r_7_': 'clerk', 'radix-_r_9_': 'auth', 'radix-_r_b_': 'errors', 'radix-_r_d_': 'settings'}

# Sidebar root: expanded/collapsed and icon mode follow the toggle.
side = side.replace('data-state="expanded" data-collapsible=""', 'data-state={sidebarState} data-collapsible={sidebarCollapsible}', 1)

# Collapsibles: the item, its trigger and its content follow one open flag each.
for rid, key in groups.items():
    # trigger
    side = re.sub(r'(<button data-slot="collapsible-trigger"[^\n]*?) type="button" aria-controls="%s" aria-expanded="true" data-state="open">' % rid,
                  lambda m: '%s type="button" aria-controls="%s" aria-expanded={%sExpanded} data-state={%sState} onClick={() => (%sOpen = !%sOpen)}>' % (m.group(1), rid, key, key, key, key), side)
    side = side.replace('<div data-state="open" id="%s" data-slot="collapsible-content" class="CollapsibleContent"' % rid,
                        '<div data-state={%sState} id="%s" hidden={%sClosed} data-slot="collapsible-content" class="CollapsibleContent"' % (key, rid, key))
# the <li> of each collapsible, in document order
order = list(groups.values())
count = [0]
def li(m):
    key = order[count[0]]; count[0] += 1
    return m.group(0).replace('data-state="open"', 'data-state={%sState}' % key)
side = re.sub(r'<li data-slot="collapsible"[^>]*data-state="open">', li, side)

# Active links: Dashboard and Users take the route's state.
def active_link(href, key, m_open):
    return None
dash_active = re.search(r'<a data-slot="sidebar-menu-button"[^\n]*data-active="true"[^\n]*>', side).group(0)
dash = dash_active.replace('data-active="true"', 'data-active={dashboardActive}').replace(' h-8 text-sm active"', ' h-8 text-sm" + dashboardActiveClass + "').replace(' data-status="active" aria-current="page"', ' data-status={dashboardStatus} aria-current={dashboardCurrent}')
side = side.replace(dash_active, dash)
users_link = re.search(r'<a data-slot="sidebar-menu-button"[^\n]*href="/users"[^\n]*>', side).group(0)
users = users_link.replace('data-active="false"', 'data-active={usersActive}').replace(' href="/users"', ' href="/users" data-status={usersStatus} aria-current={usersCurrent}')
users = re.sub(r'class="([^"]*)"', lambda m: 'class={"%s" + usersActiveClass}' % m.group(1), users)
side = side.replace(users_link, users)
side = re.sub(r'class="([^"]*)" \+ dashboardActiveClass \+ "', lambda m: 'class={"%s" + dashboardActiveClass}' % m.group(1), side)

# Menu triggers in the sidebar: team switcher and nav user.
def trigger(menu, marker):
    global side
    m = re.search(r'<button data-slot="dropdown-menu-trigger" ([^\n]*?) class="([^"]*)" type="button" id="[^"]*" aria-haspopup="menu" aria-expanded="false" data-state="closed">', side[side.index(marker) - 2000:])
    whole = m.group(0)
    attrs = m.group(1)
    replacement = '<DropdownMenuTrigger menu="%s" %s class="%s">' % (menu, attrs.replace('data-slot="dropdown-menu-trigger" ', ''), m.group(2))
    start = side.index(whole, side.index(marker) - 2000)
    end_close = side.index('</button>', start)
    side = side[:start] + replacement + side[start + len(whole):end_close] + '</DropdownMenuTrigger>' + side[end_close + len('</button>'):]
trigger('team', 'Vite + ShadcnUI')
trigger('user', 'satnaingdev@gmail.com</span>')

# Team switcher: the trigger shows the chosen team.
side = side.replace('<span class="truncate font-semibold">Shadcn Admin</span>', '<span class="truncate font-semibold">{teamName}</span>', 1)
side = side.replace('<span class="truncate text-xs">Vite + ShadcnUI</span>', '<span class="truncate text-xs">{teamPlan}</span>', 1)

# Rail toggles the sidebar.
side = side.replace('<button data-sidebar="rail" data-slot="sidebar-rail" aria-label="Toggle Sidebar" tabindex="-1" title="Toggle Sidebar"', '<button data-sidebar="rail" data-slot="sidebar-rail" aria-label="Toggle Sidebar" tabindex="-1" title="Toggle Sidebar" onClick={toggleSidebar}', 1)

open(sys.argv[1], 'w').write(side + '\n')

# ---- header: dashboard and users variants ----
def header(path, menus_topnav):
    h = open(path).read().rstrip('\n')
    # sidebar trigger
    h = h.replace('<button data-slot="sidebar-trigger" ', '<button data-slot="sidebar-trigger" onClick={toggleSidebar} ', 1)
    def menu_trigger(h, marker, menu):
        i = h.index(marker)
        start = h.rindex('<button data-slot="dropdown-menu-trigger"', 0, i)
        end_tag = h.index('\n', start)
        line = h[start:end_tag]
        m = re.match(r'<button data-slot="dropdown-menu-trigger" class="([^"]*)" type="button" id="[^"]*" aria-haspopup="menu" aria-expanded="false" data-state="closed">', line)
        assert m, line[:200]
        close = h.index('</button>', start)
        return h[:start] + '<DropdownMenuTrigger menu="%s" class="%s">' % (menu, m.group(1)) + h[end_tag:close] + '</DropdownMenuTrigger>' + h[close + len('</button>'):]
    if menus_topnav:
        h = menu_trigger(h, 'Toggle navigation menu', 'topnav')
    h = menu_trigger(h, 'Toggle theme', 'theme')
    h = menu_trigger(h, 'data-slot="avatar"', 'profile')
    h = h.replace('<button data-slot="button" class="inline-flex items-center gap-2 whitespace-nowrap', '<button data-slot="button" onClick={openSearch} class="inline-flex items-center gap-2 whitespace-nowrap', 1)
    h = re.sub(r'<button data-slot="sheet-trigger" ([^\n]*?) type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="[^"]*" data-state="closed">',
               lambda m: '<button data-slot="sheet-trigger" %s type="button" aria-haspopup="dialog" aria-expanded={drawerExpanded} aria-controls="config-drawer" data-state={drawerState} onClick={openDrawer}>' % m.group(1), h)
    return h

open(sys.argv[2], 'w').write(header('/tmp/p-header.tsrx', True) + '\n')
open(sys.argv[3], 'w').write(header('/tmp/p-header-users.tsrx', False) + '\n')

# ---- assemble the shell ----
TEMPLATE = open(sys.argv[4]).read()
out = TEMPLATE.replace('\t\t\t%%SIDEBAR%%', indent(side, 3)).replace('\t\t\t\t\t%%HEADER_DASHBOARD%%', indent(header('/tmp/p-header.tsrx', True), 5)).replace('\t\t\t\t\t%%HEADER_USERS%%', indent(header('/tmp/p-header-users.tsrx', False), 5))
open(sys.argv[5], 'w').write(out)

# ---- the command palette (cmdk in a Radix dialog), rendered once and shown by the Search button ----
def search_dialog():
    d = open('/tmp/p-search.tsrx').read().rstrip('\n')
    d = d.replace('<div role="dialog" id="radix-_r_16_" aria-describedby="radix-_r_18_" aria-labelledby="radix-_r_17_" data-state="open"',
                  '<div role="dialog" id="command-palette" aria-describedby="command-palette-description" aria-labelledby="command-palette-title" hidden={searchClosed} data-state={searchState}', 1)
    d = d.replace(' style="pointer-events: auto;">', ' style="pointer-events: auto;" onKeydown={searchKeys}>', 1)
    # the scroll area's own <style>: moved to styles/index.css (a <style> here would be scoped to this file)
    d = re.sub(r'\n\t*<style>.*?</style>', '', d)
    d = d.replace('for="radix-_r_1c_" id="radix-_r_1b_"', 'for="command-palette-input" id="command-palette-label"')
    d = d.replace('aria-controls="radix-_r_1a_" aria-labelledby="radix-_r_1b_" id="radix-_r_1c_" type="text" value="" />',
                  'aria-controls="command-palette-list" aria-labelledby="command-palette-label" id="command-palette-input" type="text" value="" onInput={(event) => filterCommands((event.target as HTMLInputElement).value)} />')
    d = d.replace('aria-label="Suggestions" id="radix-_r_1a_"', 'aria-label="Suggestions" id="command-palette-list" onClick={pickCommand}')
    # items carry what choosing them does
    targets = {
        'Dashboard': '/', 'Tasks': '/tasks', 'Apps': '/apps', 'Chats': '/chats', 'Users': '/users', 'Help Center': '/help-center',
    }
    def item(m):
        tag = m.group(0)
        value = re.search(r'data-value="([^"]*)"', tag).group(1)
        url = targets.get(value) or (value.split('-', 1)[1] if '-/' in value else None)
        extra = (' data-url="%s"' % url) if url else ''
        return tag[:-1] + extra + '>'
    d = re.sub(r'<div data-slot="command-item"[^\n]*?data-value="[^"]*">', item, d)
    themes = iter(['light', 'dark', 'system'])
    d = re.sub(r'(<div data-slot="command-item"[^\n]*?)( data-value="[^"]*")>(\n\t*<svg[^\n]*lucide-(?:sun|moon|laptop))', lambda m: '%s%s data-theme="%s">%s' % (m.group(1), m.group(2), next(themes), m.group(3)), d)
    # Radix's generated ids become stable ones, so each group keeps the heading that names it.
    names = {}
    d = re.sub(r'radix-_r_([0-9a-z]+)_', lambda m: names.setdefault(m.group(1), 'command-palette-%d' % (len(names) + 1)), d)
    # empty state, shown when nothing matches
    d = d.replace('<div data-slot="command-group"', '<div data-slot="command-empty" class="py-6 text-center text-sm" cmdk-empty="" role="presentation" hidden>No results found.</div>\n<div data-slot="command-group"', 1)
    d = d.replace('<button type="button" data-slot="dialog-close"', '<button type="button" data-slot="dialog-close" onClick={closeSearch}', 1)
    overlay = '<div data-state={searchState} data-slot="dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" style="pointer-events: auto;" hidden={searchClosed} onClick={closeSearch}></div>'
    return overlay + '\n' + d

out = open(sys.argv[5]).read().replace('\t\t%%SEARCH%%', indent(search_dialog(), 2))
open(sys.argv[5], 'w').write(out)

# Text with an "@" reads as a control-flow block in .tsrx: write it as a string expression.
final = open(sys.argv[5]).read()
open(sys.argv[5], 'w').write(re.sub(r'>([^<>{}\n]*@[^<>{}\n]*)<', lambda m: ">{'%s'}<" % m.group(1), final))
