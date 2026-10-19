// An error page outside the authenticated layout, as the old root route renders it, with the root's empty toaster.
import { state } from '@markless/core';
import type { Toast } from '../../lib/parity/sonner/index.ts';
import { Toaster } from '../../lib/parity/sonner/toaster.tsrx';
import { ForbiddenError, GeneralError, MaintenanceError, NotFoundError, UnauthorisedError } from './errors.tsrx';

export function StandaloneError({ code }: { readonly code: '401' | '403' | '404' | '500' | '503' }) @{
	let toasts = state<Toast[]>([]);
	const is401 = code === '401';
	const is403 = code === '403';
	const is404 = code === '404';
	const is500 = code === '500';
	const is503 = code === '503';
	<div class="contents">
		@if (is401) {
			<UnauthorisedError />
		}
		@if (is403) {
			<ForbiddenError />
		}
		@if (is404) {
			<NotFoundError />
		}
		@if (is500) {
			<GeneralError />
		}
		@if (is503) {
			<MaintenanceError />
		}
		<Toaster toasts={toasts} />
	</div>
}
