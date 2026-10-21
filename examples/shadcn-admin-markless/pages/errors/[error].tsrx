import type { PageProps } from '@markless/router';
import { Shell } from '../../components/layout/shell.tsrx';
import { ForbiddenError, GeneralError, MaintenanceError, NotFoundError, UnauthorisedError } from '../../components/errors/errors.tsrx';

export default function ErrorRoute({ params }: PageProps<{ readonly error: string }>) @{
	const active = `/errors/${params.error}`;
	const isUnauthorized = params.error === 'unauthorized';
	const isForbidden = params.error === 'forbidden';
	const isServer = params.error === 'internal-server-error';
	const isMaintenance = params.error === 'maintenance-error';
	const isNotFound = !isUnauthorized && !isForbidden && !isServer && !isMaintenance;
	<Shell active={active} header="search" fixed={true} border={true}>
		<div class="flex-1 [&>div]:h-full">
			@if (isUnauthorized) {
				<UnauthorisedError />
			}
			@if (isForbidden) {
				<ForbiddenError />
			}
			@if (isNotFound) {
				<NotFoundError />
			}
			@if (isServer) {
				<GeneralError />
			}
			@if (isMaintenance) {
				<MaintenanceError />
			}
		</div>
	</Shell>
}
