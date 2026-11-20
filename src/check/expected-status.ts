// The status a recording's page answered the request its key was made from: a load of that page answering otherwise is refused.
import { AsyncLocalStorage } from 'node:async_hooks';

export const expectedStatus = new AsyncLocalStorage<{ readonly url: string; readonly status: number }>();

/** Why a load of `url` that answered `status` must not be recorded, when a recording expects another status for it. */
export function unexpectedStatus(url: string, status: number): string | undefined {
	const expected = expectedStatus.getStore();
	if (!expected || new URL(url).href !== new URL(expected.url).href || status === expected.status) return undefined;
	return `${url} answered ${status} to the browser and ${expected.status} to the request its recordings are keyed by: nothing is recorded from it`;
}
