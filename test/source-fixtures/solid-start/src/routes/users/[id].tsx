import { action } from '@solidjs/router';

const save = action(async (form: FormData) => {
	'use server';
	return form.get('name');
});

export default function User() {
	return <form action={save} method="post"><input name="name" /></form>;
}
