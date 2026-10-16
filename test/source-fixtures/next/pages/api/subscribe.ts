export default async function handler(req: { method: string }, res: { status: (code: number) => { end: () => void } }) {
	if (req.method === 'POST') await fetch('https://api.example.com/subscribers', { method: 'POST' });
	res.status(204).end();
}
