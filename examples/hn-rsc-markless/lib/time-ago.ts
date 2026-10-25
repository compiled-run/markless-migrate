import ms from 'ms';

const units: Record<string, string> = {
	s: 'seconds',
	ms: 'milliseconds',
	m: 'minutes',
	h: 'hours',
	d: 'days',
};

export default function timeAgo(date: number): string {
	return date ? ms(Date.now() - date).replace(/[a-z]+/, (unit: string) => ' ' + units[unit]) : '';
}
