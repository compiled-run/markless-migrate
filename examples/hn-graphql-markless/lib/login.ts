// src/data/validation/user.ts and src/helpers/user-login-error-code.ts of the old app.
export function validateNewUser({ id, password }: { id: string; password: string }): string {
	if (id.length < 3 || id.length > 32) return 'User ID must be between 3 and 32 characters.';
	if (password.length < 8 || password.length > 100)
		return 'User password must be longer than 8 characters.';
	return '';
}

const MESSAGES: Record<string, string> = {
	pw: 'Incorrect password.',
	invalid_id: 'User ID must be between 3 and 32 characters.',
	loggedin: 'Logged in user must logout before logging in again.',
	unsuccessful: 'Login unsuccessful.',
	up: 'You have to be logged in to vote.',
	id: 'Username is taken.',
};

export function loginQuery(search: string): { message: string; goto: string } {
	const query = new URLSearchParams(search);
	const how = query.get('how');
	return { message: how ? (MESSAGES[how] ?? '') : '', goto: query.get('goto') || 'news' };
}
