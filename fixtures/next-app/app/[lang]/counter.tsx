'use client';
import { useState } from 'react';

export function Counter({ label, action }: { label: string; action: string }) {
	const [count, setCount] = useState(0);
	return (
		<div className="counter">
			<span>
				{label}: <output>{count}</output>
			</span>
			<button type="button" onClick={() => setCount(count + 1)}>
				{action}
			</button>
		</div>
	);
}
