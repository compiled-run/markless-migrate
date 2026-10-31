// A date picker field the page reads with chrono-node (natural language: "tomorrow", "in 2 days"), loaded once the page is
// idle or the field is focused, so reading a keystroke never waits on a fetch.
type Parse = (text: string) => Date | null;
let parse: Parse | undefined;
let loading: Promise<void> | undefined;
const waiting: (() => void)[] = [];

export function loadChrono(): void {
	loading ??= import('chrono-node').then((chrono) => {
		parse = (text) => chrono.parseDate(text);
		for (const next of waiting.splice(0)) next();
	});
}

/** chrono-node's parseDate(text), as the page's handler calls it; texts typed before it loaded are read in order once it has. */
export function chronoDate(text: string, then: (date: Date | null) => void): void {
	if (parse) return then(parse(text));
	waiting.push(() => then(parse!(text)));
	loadChrono();
}
