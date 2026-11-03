import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutOwners, parseLayoutSurvey, surveyRows, type SurveyRow } from '../src/check/layout-survey.ts';

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
