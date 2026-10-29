import type { PageProps } from '@markless/router';
import { behave, listen } from '../../../registry.ts';

// The preview /create shows in its iframe, as far as the designer needs: a block the design system params style, and
// the old page's scripts that forward its keys (the converted page serves them in its head).
export default function Page(_props: PageProps) @{
	<div class="relative bg-background" onKeyDown={(event) => behave(event)} onIdle={() => listen()}>
		<h1>radix preview-02</h1>
		<div class="cn-menu-target" role="menu">menu</div>
		<button type="button" data-slot="button">Button</button>
		<script src="/preview-keys.js"></script>
	</div>
}
