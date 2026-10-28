// The ports' optional packages, which the app installs only when a port that imports one is used.
declare module 'chrono-node' {
	export function parseDate(text: string, ref?: Date): Date | null;
}
