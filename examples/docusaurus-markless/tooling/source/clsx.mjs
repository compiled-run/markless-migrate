// clsx, as the theme uses it to join class names.
export default function clsx(...args) {
	const out = [];
	const walk = (value) => {
		if (!value) return;
		if (typeof value === 'string' || typeof value === 'number') out.push(String(value));
		else if (Array.isArray(value)) value.forEach(walk);
		else if (typeof value === 'object') for (const [key, on] of Object.entries(value)) if (on) out.push(key);
	};
	args.forEach(walk);
	return out.join(' ');
}
export { clsx };
