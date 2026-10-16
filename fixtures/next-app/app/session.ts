import { cookies } from 'next/headers';

export const USERS: Record<string, { name: string; role: 'member' | 'admin'; password: string }> = {
	'mia@harbour.example': { name: 'Mia', role: 'member', password: 'tuesday-roast' },
	'ada@harbour.example': { name: 'Ada', role: 'admin', password: 'green-beans' },
};

export function sessionValue(email: string): string {
	return Buffer.from(email).toString('base64url');
}

export async function currentUser() {
	const value = (await cookies()).get('session')?.value;
	return value ? USERS[Buffer.from(value, 'base64url').toString()] : undefined;
}
