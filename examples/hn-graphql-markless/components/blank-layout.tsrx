import type { Children } from '@markless/core';

export default function BlankLayout({ children }: { children?: Children }) @{
	<>
		<title>Hacker News Clone</title>
		<div class="WordSection1">{children}</div>
	</>
}
