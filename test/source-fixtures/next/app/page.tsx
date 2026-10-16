import { showBanner } from '@/flags';

export default async function Home() {
	const banner = await showBanner();
	return (
		<main>
			{banner ? <p>Sale</p> : null}
			<p>{Date.now()}</p>
		</main>
	);
}
