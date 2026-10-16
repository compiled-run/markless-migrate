import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '../../session';

type Props = { params: Promise<{ lang: string }> };

export const metadata: Metadata = { title: 'Members | Harbour Coffee' };

export default async function Members({ params }: Props) {
	const { lang } = await params;
	const user = await currentUser();
	if (!user) redirect(`/${lang}/login`);
	return (
		<>
			<h1>Members</h1>
			<p>Welcome back, {user?.name ?? 'guest'}.</p>
			<p>Members get first pick of every Tuesday roast.</p>
		</>
	);
}
