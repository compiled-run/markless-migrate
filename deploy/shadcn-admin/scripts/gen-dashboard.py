# Builds pages/index.tsrx (the dashboard) from the old app's rendered <main> and Analytics panel
# (captured with dom-to-tsrx.mjs), with tabs on @markless/ui and the charts left for the recharts port.
import re, sys

main = open('/tmp/p-main.tsrx').read().rstrip('\n')
analytics = open('/tmp/p-analytics.tsrx').read().rstrip('\n')

def drop_chart(text, key):
    # The chart's rendered SVG is replaced by an empty container the recharts port draws into.
    m = re.search(r'(\t*)<div class="recharts-responsive-container" style="([^"]*)">', text)
    indent = m.group(1)
    start = m.start()
    end = text.index('\n' + indent + '</div>', m.end()) + len('\n' + indent + '</div>')
    return text[:start] + indent + ('<OverviewChart />' if key == 'overview' else '<AnalyticsChart />') + text[end:]

main = drop_chart(main, 'overview')
analytics = drop_chart(analytics, 'analytics')

ACTIVE = lambda c: c.replace('dark:data-[state=active]:', 'dark:[&[ui-selected]]:').replace('data-[state=active]:', '[&[ui-selected]]:')

main = main.replace('<div dir="ltr" data-orientation="vertical" data-slot="tabs" class="flex flex-col gap-2 space-y-4">', '<tabs.root value="overview" orientation="vertical" dir="ltr" data-orientation="vertical" data-slot="tabs" class="flex flex-col gap-2 space-y-4">')
m = re.search(r'<div role="tablist" aria-orientation="vertical" data-slot="tabs-list" class="([^"]*)" tabindex="0" data-orientation="vertical" style="outline: none;">', main)
main = main.replace(m.group(0), '<tabs.list data-slot="tabs-list" class="%s" data-orientation="vertical" style="outline: none;">' % m.group(1))
for value, label in [('overview', 'Overview'), ('analytics', 'Analytics'), ('reports', 'Reports'), ('notifications', 'Notifications')]:
    t = re.search(r'<button type="button" role="tab" aria-selected="(?:true|false)" aria-controls="[^"]*-content-%s" data-state="[a-z]*"( data-disabled="" disabled)? id="[^"]*" data-slot="tabs-trigger" class="([^"]*)" tabindex="-1" data-orientation="vertical" data-radix-collection-item="">%s</button>' % (value, label), main)
    assert t, value
    disabled = ' disabled' if t.group(1) else ''
    main = main.replace(t.group(0), '<tabs.trigger value="%s"%s data-slot="tabs-trigger" class="%s" data-orientation="vertical">%s</tabs.trigger>' % (value, disabled, ACTIVE(t.group(2)), label))
# the tablist's closing tag
i = main.index('</tabs.trigger>', main.index('value="notifications"'))
j = main.index('</div>', i)
main = main[:j] + '</tabs.list>' + main[j + len('</div>'):]

over = re.search(r'<div data-state="active" data-orientation="vertical" role="tabpanel" aria-labelledby="[^"]*" id="[^"]*" tabindex="0" data-slot="tabs-content" class="flex-1 outline-none space-y-4" style="animation-duration: 0s;">', main)
main = main.replace(over.group(0), '<tabs.content value="overview" aria-label="Overview" data-orientation="vertical" data-slot="tabs-content" class="flex-1 outline-none space-y-4">')
ana = re.search(r'(\t*)<div data-state="inactive" data-orientation="vertical" role="tabpanel" aria-labelledby="[^"]*" hidden id="[^"]*" tabindex="0" data-slot="tabs-content" class="flex-1 outline-none space-y-4"></div>', main)
indent = ana.group(1)
inner = '\n'.join(indent + '\t' + l for l in analytics.split('\n')[1:-1])
# the overview panel closes on the line before the analytics panel
before = main[:ana.start()].rstrip('\n')
k = before.rindex('</div>')
before = before[:k] + '</tabs.content>' + before[k + len('</div>'):]
main = before + '\n' + indent + '<tabs.content value="analytics" aria-label="Analytics" data-orientation="vertical" data-slot="tabs-content" class="flex-1 outline-none space-y-4">\n' + inner + '\n' + indent + '</tabs.content>' + main[ana.end():]
# the tabs root closes just before </main>
k = main.rindex('</div>', 0, main.rindex('</main>'))
main = main[:k] + '</tabs.root>\n\t\t<script src="/parity/recharts.js"></script>' + main[k + len('</div>'):]

body = '\n'.join('\t\t' + l for l in main.split('\n'))
page = '''// The dashboard (features/dashboard/index.tsx): cards, the overview and analytics charts, recent sales.
// Markup from the old app's rendered DOM (deploy/shadcn-admin/scripts/gen-dashboard.py); tabs on
// @markless/ui tabs; the charts drawn by the recharts port (public/parity/recharts.js).
import { tabs } from '@markless/ui';
import { Shell } from '../components/layout/shell.tsrx';
import { AnalyticsChart, OverviewChart } from '../lib/parity/recharts/charts.tsrx';

export default function Dashboard() @{
	<Shell active="/">
%s
	</Shell>
}
''' % body
open(sys.argv[1], 'w').write(page)
