import { graphql } from './graphql.ts';
import { parseHtml, type Block } from './html.ts';
import { USER_QUERY } from './queries.ts';
import { loadSession, sessionOf, signedOut, type Session } from './session.ts';
import { convertNumberToTimeAgo } from './time-ago.ts';

export interface UserView {
	readonly session: Session;
	readonly kind: 'none' | 'own' | 'public';
	readonly id: string;
	readonly created: string;
	readonly karma: string;
	readonly about: readonly Block[];
	readonly aboutText: string;
	readonly email: string;
	readonly userHref: string;
	readonly submittedHref: string;
	readonly threadsHref: string;
	readonly favoritesHref: string;
}

interface UserData {
	readonly user: {
		id: string;
		about: string | null;
		creationTime: number;
		email: string | null;
		karma: number;
	} | null;
	readonly me: { id: string } | null;
}

// The layout's ME query goes out only when Apollo's cache could not answer it from the user query, as on the old page.
export async function loadUser(search: string): Promise<UserView> {
	const id = new URLSearchParams(search).get('id') || '';
	const { data } = await graphql<UserData>(USER_QUERY, { id });
	const user = data?.user;
	const me = data?.me;
	const session =
		!user || !me ? signedOut : me.id === user.id ? sessionOf(user) : await loadSession();
	if (!user)
		return {
			session,
			kind: 'none',
			id: '',
			created: '',
			karma: '',
			about: [],
			aboutText: '',
			email: '',
			userHref: '',
			submittedHref: '',
			threadsHref: '',
			favoritesHref: '',
		};
	return {
		session,
		kind: data?.me && user.id === data.me.id ? 'own' : 'public',
		id: user.id,
		created: convertNumberToTimeAgo(user.creationTime),
		karma: `${user.karma}`,
		about: parseHtml(user.about),
		aboutText: user.about ?? '',
		email: user.email ?? '',
		userHref: `user?id=${user.id}`,
		submittedHref: `submitted?id=${user.id}`,
		threadsHref: `threads?id=${user.id}`,
		favoritesHref: `favorites?id=${user.id}`,
	};
}
