import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
	const session = await auth();
	if (session?.user.role !== 'admin') redirect('/login');
	return <section>{children}</section>;
}
