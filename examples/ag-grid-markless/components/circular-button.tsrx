import type { Children } from '@markless/core';
import { computed } from '@markless/core';

export default function CircularButton({ children, onClick, tooltip, active }: { children?: Children; onClick: () => void; tooltip: string; active: boolean }) @{
	const cls = computed(() => `${active ? 'text-blue-500' : 'text-charcoal-200'} rounded-full p-1 cursor-pointer hover:bg-gray-300 hover:dark:bg-charcoal-300`);
	<button title={tooltip} class={cls} onClick={() => onClick()}>{children}</button>
}
