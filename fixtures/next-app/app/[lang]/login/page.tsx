import type { Metadata } from 'next';

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ error?: string }> };

export const metadata: Metadata = { title: 'Sign in | Harbour Coffee' };

export default async function Login({ params, searchParams }: Props) {
	const { lang } = await params;
	const { error } = await searchParams;
	return (
		<>
			<h1>Sign in</h1>
			{error ? <p role="alert">Wrong email or password.</p> : null}
			<form method="post" action="/api/login">
				<input type="hidden" name="lang" value={lang} />
				<label>
					Email
					<input name="email" type="email" autoComplete="email" required />
				</label>
				<label>
					Password
					<input name="password" type="password" autoComplete="current-password" required />
				</label>
				<button type="submit">Sign in</button>
			</form>
		</>
	);
}
