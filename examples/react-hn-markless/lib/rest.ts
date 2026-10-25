import { DATABASE_HOST, userPath, type User } from './hn.ts';

/** One read of the database's REST endpoint, for values the page renders on the server. */
export async function read<T>(path: string): Promise<T | null> {
	const response = await fetch(`https://${DATABASE_HOST}/${path}.json`);
	if (!response.ok) throw new Error(`${path}: ${response.status}`);
	return (await response.json()) as T | null;
}

export async function fetchUser(id: string): Promise<User> {
	const user = await read<User>(userPath(id));
	if (!user?.id) throw new Error(`no user ${id}`);
	return user;
}
