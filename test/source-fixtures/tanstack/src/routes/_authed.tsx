import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed')({
	beforeLoad: ({ context }) => {
		if (!context.auth.user) throw redirect({ to: '/login' });
	},
});
