import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Shell } from '../components/shell.tsrx';
import { bindRequest } from '../lib/request.ts';
import { here, onServer, storedSandbox } from '../lib/where.ts';

export default function Expensive({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();

	<Shell url={url} sandbox={sandbox}>
		<div class="p-2">I am an "expensive" component... which really just means that I was code-split 😉</div>
	</Shell>
}
