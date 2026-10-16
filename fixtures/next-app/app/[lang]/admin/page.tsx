import type { Metadata } from 'next';
import { forbidden, redirect } from 'next/navigation';
import { currentUser } from '../../session';

type Props = { params: Promise<{ lang: string }> };

export const metadata: Metadata = { title: 'Roastery admin | Harbour Coffee' };

export default async function Admin({ params }: Props) {
	const { lang } = await params;
	const user = await currentUser();
	if (!user) redirect(`/${lang}/login`);
	if (user.role !== 'admin') forbidden();
	return (
		<>
			<h1>Roastery admin</h1>
			<p>Signed in as {user.name}.</p>
			<p>Next roast: 40 kg of Harbour Blend.</p>
		</>
	);
}
