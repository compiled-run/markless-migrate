export async function GET() {
	return new Response('[]');
}

export async function DELETE() {
	return new Response(null, { status: 204 });
}
