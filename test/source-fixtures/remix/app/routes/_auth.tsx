import { redirect } from '@remix-run/node';
import { Outlet } from '@remix-run/react';
import { getUser } from '~/session.server';

export async function loader({ request }: { request: Request }) {
	const user = await getUser(request);
	if (!user) throw redirect('/login');
	return null;
}

export default function AuthLayout() {
	return <Outlet />;
}
