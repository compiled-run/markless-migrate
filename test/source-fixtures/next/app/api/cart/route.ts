import { cookies } from 'next/headers';

export async function GET() {
	const store = await cookies();
	return Response.json({ cart: store.get('cart')?.value ?? null });
}

export async function POST(request: Request) {
	return Response.json(await request.json(), { status: 201 });
}
