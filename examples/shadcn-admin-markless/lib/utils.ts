import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

export function sleep(ms = 1000): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
