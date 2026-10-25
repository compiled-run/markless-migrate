import { tickPeriod } from './hn.ts';

/** Re-reads the clock as react-timeago did: every second while a shown time is under a minute old, every minute under an hour, every hour under a day. */
export function tick(update: () => void, shown: () => readonly number[] = () => []): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const schedule = () => {
		const now = Date.now();
		const periods = shown()
			.map((then) => tickPeriod(then, now))
			.filter((period) => period > 0);
		if (!periods.length) {
			timer = setTimeout(schedule, 60_000);
			return;
		}
		timer = setTimeout(
			() => {
				update();
				schedule();
			},
			Math.min(...periods),
		);
	};
	schedule();
	return () => clearTimeout(timer);
}
