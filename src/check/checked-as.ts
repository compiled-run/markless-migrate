// What a route's check covered besides what it ships: in full or left to its template's representative, and which of the
// site's shared layout controls it exercised. Both are functions of the site (check's --site-targets and layout survey).
import type { SideEnv } from './browser.ts';
import { layoutOwners, type LayoutSurvey } from './layout-survey.ts';
import { templateGroups } from './report-judge.ts';
import { groupTemplates, TEMPLATE_THRESHOLD, type TemplateGroup } from './templates.ts';

export type TemplateOptions = false | { readonly patterns?: readonly string[]; readonly threshold?: number; readonly site?: readonly string[] };

/** The template groups a check makes: over the site's pages and this run's, once there are more than the threshold. */
export async function siteGroups(old: SideEnv, pages: readonly string[], templates: TemplateOptions | undefined): Promise<TemplateGroup[]> {
	if (templates === false) return [];
	const all = templates?.site ? [...new Set([...templates.site, ...pages])] : pages;
	return all.length > (templates?.threshold ?? TEMPLATE_THRESHOLD) ? groupTemplates(old, all, templates?.patterns) : [];
}

/** One line naming how a route was checked; `owned` is undefined when the run had no layout survey to place shared controls by. */
export function checkedAs(light: boolean, owned: readonly string[] | undefined): string {
	return `${light ? 'left to its representative' : 'in full'}; shared controls ${owned ? JSON.stringify([...owned].sort()) : 'unsurveyed'}`;
}

/** The shared layout controls each route exercises for the site, by the anonymous role's survey. */
export function ownedBy(survey: LayoutSurvey): (route: string) => string[] {
	const rows = survey.roles.find((r) => r.role === null)?.routes ?? [];
	const owners = [...layoutOwners(rows)];
	return (route) => owners.filter(([, owner]) => owner === route).map(([signature]) => signature);
}

/** How each route of the site would be checked now. */
export async function routeRoles(input: { readonly old: SideEnv; readonly site: readonly string[]; readonly templates: TemplateOptions | undefined; readonly survey?: LayoutSurvey }): Promise<(route: string) => string> {
	const { light } = templateGroups(await siteGroups(input.old, input.site, input.templates));
	const owned = input.survey ? ownedBy(input.survey) : undefined;
	return (route) => checkedAs(light(route), owned?.(route));
}
