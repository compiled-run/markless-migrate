import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRouteJourneys, routeJourneyBudget, routeTimeout } from '../src/check/run.ts';

test("a targets file's journeys give one route its own budget, over the run's for that route only", () => {
	const routeJourneys = parseRouteJourneys({ '/docs/a/': { 'max-journeys': 1200, 'journey-budget': 9600 } });
	assert.deepEqual(routeJourneys, { '/docs/a/': { maxJourneys: 1200, budgetMs: 9_600_000 } });
	const options = { journeys: { maxJourneys: 80 }, routeJourneys };
	assert.deepEqual(routeJourneyBudget(options, '/docs/a/'), { maxJourneys: 1200, budgetMs: 9_600_000 });
	assert.deepEqual(routeJourneyBudget(options, '/docs/b/'), { maxJourneys: 80 });
	assert.equal(routeTimeout({ journeys: routeJourneyBudget(options, '/docs/a/') }), 5 * 9_600_000);
	assert.equal(routeTimeout({ journeys: routeJourneyBudget(options, '/docs/b/') }), routeTimeout({}));
	assert.deepEqual(parseRouteJourneys(undefined), {});
});

test('a route journey setting that is not a budget is refused, not ignored', () => {
	assert.throws(() => parseRouteJourneys(['/a/']), /must map each route/);
	assert.throws(() => parseRouteJourneys({ '/a/': { 'max-journeys': 0 } }), /whole number of at least 1/);
	assert.throws(() => parseRouteJourneys({ '/a/': { 'journey-budget': '60' } }), /seconds above 0/);
	assert.throws(() => parseRouteJourneys({ '/a/': { depth: 3 } }), /not depth/);
});
