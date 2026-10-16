export async function loader({ request }: { request: Request }) {
	return Response.json({ q: new URL(request.url).searchParams.get('q') });
}
