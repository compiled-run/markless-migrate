import { Form } from 'react-router';

export async function action({ request }: { request: Request }) {
	const form = await request.formData();
	return { ok: form.has('email') };
}

export default function Login() {
	return (
		<Form method="post">
			<input name="email" />
		</Form>
	);
}
