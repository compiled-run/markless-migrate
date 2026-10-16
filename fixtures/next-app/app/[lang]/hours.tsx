'use client';
import { useEffect, useState } from 'react';

export function Hours({ cms, label }: { cms: string; label: string }) {
	const [today, setToday] = useState('loading');
	useEffect(() => {
		if (!cms) return;
		const load = () =>
			fetch(`${cms}/coffee/hours`)
				.then((response) => response.json())
				.then((data: { today: string }) => setToday(data.today))
				.catch(() => setToday('unavailable'));
		void load();
	}, [cms]);
	return (
		<p className="hours">
			{label}: <span>{today}</span>
		</p>
	);
}
