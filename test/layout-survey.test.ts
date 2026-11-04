import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinSurveys, layoutOwners, parseLayoutSurvey, surveyRows, type SurveyRow } from '../src/check/layout-survey.ts';

const rows: SurveyRow[] = [
	{ route: '/', layout: ['header|button|Menu|0', 'nav|link|Docs|0'], own: 39 },
	{ route: '/docs', layout: ['header|button|Menu|0', 'nav|link|Docs|0'], own: 3 },
	{ route: '/blocks', layout: ['header|button|Menu|0'], own: 0, failed: true },
];

test('the first page of the site with room owns a shared control; a full one hands the next to the page after it', () => {
	assert.deepEqual([...layoutOwners(rows)], [['header|button|Menu|0', '/'], ['nav|link|Docs|0', '/docs']]);
});

test('past every page’s room, the least loaded page owns it', () => {
	assert.deepEqual([...layoutOwners([{ route: '/a', layout: ['header|x'], own: 50 }, { route: '/b', layout: ['header|x'], own: 45 }])], [['header|x', '/b']]);
});

test('a survey must cover every route the check explores, for the role it checks as', () => {
	const survey = parseLayoutSurvey(JSON.stringify({ version: 1, roles: [{ role: null, routes: rows }] }), 'survey.json');
	assert.equal(surveyRows(survey, undefined, ['/docs']), survey.roles[0]!.routes);
	assert.throws(() => surveyRows(survey, undefined, ['/docs', '/charts']), /does not cover 1 route this check explores \(\/charts\)/);
	assert.throws(() => surveyRows(survey, 'admin', ['/docs']), /no role admin survey/);
	assert.throws(() => parseLayoutSurvey('{"version":0,"roles":[]}', 'old.json'), /version 0, not 1/);
});

test('surveys of slices dealt in turn join into the survey of every route, in the site order the owners follow', () => {
	const whole = { version: 1 as const, roles: [{ role: null, routes: rows }] };
	const slices = [
		{ version: 1 as const, roles: [{ role: null, routes: [rows[0]!, rows[2]!] }] },
		{ version: 1 as const, roles: [{ role: null, routes: [rows[1]!] }] },
	];
	const joined = joinSurveys(slices, ['/', '/docs', '/blocks']);
	assert.deepEqual(joined, whole);
	assert.deepEqual([...layoutOwners(joined.roles[0]!.routes)], [...layoutOwners(rows)]);
	assert.throws(() => joinSurveys([...slices, slices[1]!], ['/', '/docs', '/blocks']), /\/docs is in more than one layout survey slice/);
	assert.throws(() => joinSurveys(slices, ['/', '/docs']), /\/blocks is not a route of the site's targets/);
	assert.throws(() => joinSurveys([slices[0]!, { version: 1, roles: [{ role: 'admin', routes: [rows[1]!] }] }], ['/', '/docs', '/blocks']), /different roles/);
});
