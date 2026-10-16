export async function action({ request }: { request: Request }) {
	if (request.method === 'DELETE') return null;
	return null;
}

export default function Settings() {
	return <h1>Settings</h1>;
}
