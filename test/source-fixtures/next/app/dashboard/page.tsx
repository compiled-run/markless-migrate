import { prisma } from '@/lib/db';

async function rename(form: FormData) {
	'use server';
	await prisma.user.update({ where: { id: 1 }, data: { name: String(form.get('name')) } });
}

export default function Dashboard() {
	return (
		<form action={rename}>
			<input name="name" />
		</form>
	);
}
