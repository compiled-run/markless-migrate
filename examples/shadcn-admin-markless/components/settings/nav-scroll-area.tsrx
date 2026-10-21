// The settings nav's Radix ScrollArea (components/ui/scroll-area.tsx in the old app): its own small component, so the
// scrollbar measuring it starts at load runs this code alone, not the settings layout's.
import { element } from '@markless/core';
import type { Children } from '@markless/core';
import { trackScrollbar } from '../../lib/settings/scroll-area.ts';

export function NavScrollArea({ children }: { readonly children?: Children }) @{
	const area = element<HTMLDivElement>();
	<div el={area} onIdle={() => trackScrollbar(area)} dir="ltr" data-slot="scroll-area" class="relative hidden w-full min-w-40 bg-background px-1 py-2 md:block" style="position: relative; --radix-scroll-area-corner-width: 0px; --radix-scroll-area-corner-height: 0px;">
		{children}
	</div>
}
