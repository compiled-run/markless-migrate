export async function getUser(request: Request) {
	return request.headers.get('cookie')?.includes('user=') ? { id: 1 } : null;
}
