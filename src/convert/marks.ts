/** A mark a capture writes on what it reads, versioned on its own: bumping one takes again only what it applies to. */
export interface Mark {
	readonly id: string;
	readonly version: number;
	/** Whether the mark reads anything in this markup: a capture holding no such markup never needs taking again for it. */
	readonly applies: (html: string) => boolean;
}

/** The version of each mark a capture was written with, by mark id. */
export type Marked = Readonly<Record<string, number>>;

export const marksOf = (marks: readonly Mark[]): Marked => Object.fromEntries(marks.map((m) => [m.id, m.version]));

/** The marks that markup taken with `marked` still lacks: each that applies to some of it and was not written at its current version. */
export const missingMarks = (htmls: readonly string[], marked: Marked, marks: readonly Mark[]): Mark[] => marks.filter((m) => marked[m.id] !== m.version && htmls.some(m.applies));
