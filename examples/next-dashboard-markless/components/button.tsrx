import type { Children } from '@markless/core';

export const BUTTON = 'flex h-10 items-center rounded-lg bg-blue-500 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:bg-blue-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

export function Button({ extraClass, children }: { readonly extraClass: string; readonly children?: Children }) @{
	<button type="submit" class={`${BUTTON} ${extraClass}`}>{children}</button>
}
