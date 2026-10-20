// A clock's reading (63:02:59:59, 12:30:05): a page's own clock ticks with its timers, so two captures read it at different seconds.
const READING = /\d{1,3}(?::\d{2}){1,3}/;
const CLOCK = new RegExp(`^\\s*${READING.source}\\s*$`);
const CLOCK_LINE = new RegExp(`^(\\s*- [^"]*")${READING.source}(".*)$`);

export const isClock = (text: string): boolean => CLOCK.test(text);

/** An accessibility tree line or a line of visible text that is only a clock, with its reading masked; undefined for any other line. */
export function clockLine(line: string): string | undefined {
	if (CLOCK.test(line)) return '<clock>';
	const m = CLOCK_LINE.exec(line);
	return m ? `${m[1]}<clock>${m[2]}` : undefined;
}

export const maskClocks = (lines: readonly string[]): string[] => lines.map((line) => clockLine(line) ?? line);
