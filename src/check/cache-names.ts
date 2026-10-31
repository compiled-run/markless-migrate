// Imported by the merge job's scripts, which run without the checker's dependencies installed.
export const TAG_LENGTH = 12;
/** A cache directory's marker of a checker version and old build a run used: `in-use-<tag>`. */
export const IN_USE = 'in-use-';

/** The tag in an entry's or marker's file name. */
export function entryTag(name: string): string | undefined {
	return name.startsWith(IN_USE) ? name.slice(IN_USE.length) : new RegExp(`^[a-z]+-([0-9a-f]{${TAG_LENGTH}})-[0-9a-f]+\\.bin$`).exec(name)?.[1];
}
