// The site's shared layout controls, surveyed once over every page of the site: which route exercises each one is a function
// of the site, never of the routes one shard happens to hold.

/** One page of the site: the signatures of the layout controls it shows, and how many controls of its own its journeys exercise. */
export interface SurveyRow {
	readonly route: string;
	readonly layout: readonly string[];
	readonly own: number;
	/** The page could not be surveyed on either try: it owns no shared control. */
	readonly failed?: true;
}

export interface LayoutSurvey {
	readonly version: typeof LAYOUT_SURVEY_VERSION;
	/** One survey per role, in the order the check signs in (null is anonymous). */
	readonly roles: readonly { readonly role: string | null; readonly routes: readonly SurveyRow[] }[];
}

export const LAYOUT_SURVEY_VERSION = 1;

// About as many controls as a route's journey budget exercises at its default (49 on ui.shadcn.com's home page, its heaviest).
const ROUTE_ROOM = 40;

/** Which route exercises each shared layout control: the first, in the survey's order, that has it and room left; past every route's room, the least loaded. */
export function layoutOwners(rows: readonly SurveyRow[]): Map<string, string> {
	const load = rows.map((r) => r.own);
	const having = new Map<string, number[]>();
	rows.forEach((row, i) => {
		for (const signature of row.layout) (having.get(signature) ?? having.set(signature, []).get(signature)!).push(i);
	});
	const owners = new Map<string, string>();
	for (const [signature, at] of having) {
		const i = at.find((k) => load[k]! < ROUTE_ROOM) ?? at.reduce((a, b) => (load[b]! < load[a]! ? b : a));
		load[i]!++;
		owners.set(signature, rows[i]!.route);
	}
	return owners;
}

/** The given survey's rows for one role, which must cover every route this run explores in full. */
export function surveyRows(survey: LayoutSurvey, role: string | undefined, explored: readonly string[]): readonly SurveyRow[] {
	const rows = survey.roles.find((r) => r.role === (role ?? null))?.routes;
	if (!rows) throw new Error(`the layout survey has no ${role ? `role ${role}` : 'anonymous'} survey: make it with the same --auth as this check`);
	const have = new Set(rows.map((r) => r.route));
	const missing = explored.filter((route) => !have.has(route));
	if (missing.length) throw new Error(`the layout survey does not cover ${missing.length} route${missing.length === 1 ? '' : 's'} this check explores (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}): make it over the same --site-targets`);
	return rows;
}

export function parseLayoutSurvey(text: string, from: string): LayoutSurvey {
	const survey = JSON.parse(text) as LayoutSurvey;
	if (survey.version !== LAYOUT_SURVEY_VERSION) throw new Error(`${from} is a layout survey of version ${String(survey.version)}, not ${LAYOUT_SURVEY_VERSION}: make it again with check --write-layout-survey`);
	return survey;
}
