// How a route's check covered it beyond what it ships: in full or left to its representative, and its shared layout controls.
import type { SideEnv } from './browser.ts';
import { layoutOwners, type LayoutSurvey, type SurveyRow } from './layout-survey.ts';
import { templateGroups } from './report-judge.ts';
import { groupTemplates, TEMPLATE_THRESHOLD, type TemplateGroup } from './templates.ts';

export type TemplateOptions = false | { readonly patterns?: readonly string[]; readonly threshold?: number; readonly site?: readonly string[] };

/** The template groups a check makes: over the site's pages and this run's, once there are more than the threshold. */
export async function siteGroups(old: SideEnv, pages: readonly string[], templates: TemplateOptions | undefined): Promise<TemplateGroup[]> {
	if (templates === false) return [];
	const all = templates?.site ? [...new Set([...templates.site, ...pages])] : pages;
	return all.length > (templates?.threshold ?? TEMPLATE_THRESHOLD) ? groupTemplates(old, all, templates?.patterns) : [];
}

/** The shared layout controls on a route's pages: those it exercises itself (`owned`) and those it leaves to their owners. */
export interface SharedControls {
	readonly owned: readonly string[];
	readonly left: readonly string[];
}

/** One line naming how a route was checked; `shared` is undefined when no layout survey placed shared controls. */
export function checkedAs(light: boolean, shared: SharedControls | undefined): string {
	const list = (names: readonly string[]) => JSON.stringify([...names].sort());
	return `${light ? 'left to its representative' : 'in full'}; shared controls ${shared ? `${list(shared.owned)}, left to others ${list(shared.left)}` : 'unsurveyed'}`;
}

/** How a run checked a route; with no survey given, one that left a control to another route of the run is named so, not as if checked alone. */
export function checkedAsRun(light: boolean, controls: SharedControls, surveyed: boolean): string {
	return checkedAs(light, surveyed || controls.left.length ? controls : undefined);
}

/** Each route's shared layout controls, by a survey's rows and the owners they give. */
export function sharedControls(rows: readonly SurveyRow[], owners: ReadonlyMap<string, string> = layoutOwners(rows)): (route: string) => SharedControls {
	const layouts = new Map(rows.map((r) => [r.route, [...new Set(r.layout)]]));
	return (route) => {
		const on = layouts.get(route) ?? [];
		return { owned: on.filter((s) => owners.get(s) === route), left: on.filter((s) => owners.get(s) !== route) };
	};
}

/** How each route of the site would be checked now, by the anonymous role's survey. */
export async function routeRoles(input: { readonly old: SideEnv; readonly site: readonly string[]; readonly templates: TemplateOptions | undefined; readonly survey?: LayoutSurvey }): Promise<(route: string) => string> {
	const { light } = templateGroups(await siteGroups(input.old, input.site, input.templates));
	const shared = input.survey ? sharedControls(input.survey.roles.find((r) => r.role === null)?.routes ?? []) : undefined;
	return (route) => checkedAs(light(route), shared?.(route));
}
