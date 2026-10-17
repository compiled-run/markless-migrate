import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';

// Prisma's @default(cuid()): c, the time, a counter, a host fingerprint and randomness, all base 36.
let counter = Math.floor(Math.random() * 1679616);
const pad = (value: string, size: number) => value.padStart(size, '0').slice(-size);
const fingerprint = pad(process.pid.toString(36), 2) + pad([...hostname()].reduce((sum, c) => sum + c.charCodeAt(0), hostname().length + 36).toString(36), 2);

export function cuid(): string {
	counter = (counter + 1) % 1679616;
	const random = () => pad(randomBytes(4).readUInt32BE(0).toString(36), 4);
	return `c${Date.now().toString(36)}${pad(counter.toString(36), 4)}${fingerprint}${random()}${random()}`;
}
