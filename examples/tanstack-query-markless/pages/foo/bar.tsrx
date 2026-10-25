import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { ErrorComponent } from '../../components/error.tsrx';
import { Shell } from '../../components/shell.tsrx';
import { bindRequest } from '../../lib/request.ts';
import { here, onServer, storedSandbox } from '../../lib/where.ts';
import { parseSearch } from '../../lib/search.ts';

export default function FooBar({ url, http }: PageProps) @{
	const ctx = onServer ? bindRequest(http) : undefined;
	const sandbox = ctx ? ctx.sandbox : storedSandbox();
	const search = parseSearch(here(url).search);
	const valid = typeof search.asdf === 'string';
	const shown = JSON.stringify({ asdf: search.asdf });
	const message = valid ? '' : JSON.stringify([{ expected: 'string', code: 'invalid_type', path: ['asdf'], message: `Invalid input: expected string, received ${search.asdf === undefined ? 'undefined' : typeof search.asdf}` }], null, 2);

	<Shell url={url} sandbox={sandbox}>
		@if (valid) {
			<div>{shown}</div>
		} @else {
			<ErrorComponent error={{ message }} />
		}
	</Shell>
}
