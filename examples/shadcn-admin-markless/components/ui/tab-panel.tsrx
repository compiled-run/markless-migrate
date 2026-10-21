// A panel of @markless/ui tabs written as Radix's TabsContent writes it: no aria-live, so a dialog opened over the
// page hides the panel (and the <main> around it) from assistive technology the way the old page's dialogs do.
import { computed } from '@markless/core';
import type { PropsOf } from '@markless/core';
import { tabs } from '@markless/ui';

type TabPanelProps = PropsOf<'div'> & { readonly value: string };

export function TabPanel({ value, children, ...rest }: TabPanelProps) @{
	const t = tabs.state();
	const isShowing = computed(() => t.value === value);
	<div {...rest} role="tabpanel" hidden={isShowing !== true} tabindex="0" ui-selected={isShowing}>{children}</div>
}
