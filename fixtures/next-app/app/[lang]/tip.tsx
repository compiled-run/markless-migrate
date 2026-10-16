'use client';
import { useEffect, useState } from 'react';

const TIPS = ['Grind just before you brew.', 'Use water just off the boil.', 'Weigh your beans, not your scoops.', 'Store beans away from light.'];

export function Tip({ label }: { label: string }) {
	const [tip, setTip] = useState('');
	useEffect(() => setTip(TIPS[Math.floor(Math.random() * TIPS.length)]!), []);
	return (
		<p className="tip">
			{label}: <span>{tip}</span>
		</p>
	);
}
