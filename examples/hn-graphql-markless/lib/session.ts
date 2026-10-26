import { graphql } from './graphql.ts';
import { ME_QUERY } from './queries.ts';

export interface Session {
	readonly signedIn: boolean;
	readonly id: string;
	readonly userHref: string;
	readonly karma: string;
}

export const signedOut: Session = { signedIn: false, id: '', userHref: '', karma: '' };

export function sessionOf(me: { id: string; karma: number } | null | undefined): Session {
	return me
		? { signedIn: true, id: me.id, userHref: `/user?id=${me.id}`, karma: ` (${me.karma}) | ` }
		: signedOut;
}

export async function loadSession(): Promise<Session> {
	const result = await graphql<{ me: { id: string; karma: number } | null }>(ME_QUERY);
	return sessionOf(result.data?.me);
}
