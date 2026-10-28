import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { directoryView, pageHref, pageNumbers, rank, type DirectoryEntry } from '../examples/shadcn-ui-markless/lib/site/directory.ts';

const entry = (name: string, description = `${name} components`): DirectoryEntry => ({ name, homepage: `https://${name.slice(1)}.dev`, description, logo: name.slice(1), viewBox: '0 0 24 24' });
const NOW = Date.parse('2026-10-27T12:00:00Z');
const health = (status: string, score: number, hoursAgo = 1, monitoringLimited = false) => ({ status, score, checkedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(), monitoringLimited });

// components/directory-list.tsx's getPageNumbers, as the old page has it.
function original(current: number, total: number): (number | 'ellipsis')[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
	const pages: (number | 'ellipsis')[] = [1];
	if (current > 4) pages.push('ellipsis');
	else if (current >= 4) pages.push(2);
	const start = Math.max(2, current - 1);
	const end = Math.min(total - 1, current + 1);
	for (let i = start; i <= end; i++) pages.push(i);
	if (current < total - 3) pages.push('ellipsis');
	else if (current <= total - 3) pages.push(total - 1);
	pages.push(total);
	return pages;
}

test('page numbers match the original pagination for every page of every length', () => {
	fc.assert(fc.property(fc.integer({ min: 1, max: 80 }), fc.integer({ min: 1, max: 80 }), (total, at) => {
		const current = Math.min(at, total);
		assert.deepEqual(pageNumbers(current, total), original(current, total));
	}));
});

test('with no health answer, or one older than six hours, registries are listed by name', () => {
	const dir = [entry('@zeta'), entry('@Alpha'), entry('@beta')];
	assert.deepEqual(rank(dir, undefined, NOW).map((r) => r.name), ['@Alpha', '@beta', '@zeta']);
	assert.deepEqual(rank(dir, [{ name: '@zeta', health: health('healthy', 99, 7) }], NOW).map((r) => r.name), ['@Alpha', '@beta', '@zeta']);
});

test('fresh health ranks healthy registries by score, then unmonitored ones, then unavailable ones', () => {
	const dir = ['@a', '@b', '@c', '@d', '@e'].map((n) => entry(n));
	const payload = [
		{ name: '@a', health: health('unavailable', 90) },
		{ name: '@b', health: health('healthy', 40) },
		{ name: '@c', health: health('healthy', 80) },
		{ name: '@d', health: health('observing', 95) },
		{ name: '@nope', health: health('healthy', 100) },
	];
	assert.deepEqual(rank(dir, payload, NOW).map((r) => r.name), ['@c', '@b', '@d', '@e', '@a']);
});

test('rankings, once any registry has one, order by their score and send registries without one or with no items down', () => {
	const dir = ['@a', '@b', '@c', '@d'].map((n) => entry(n));
	const payload = [
		{ name: '@a', health: health('healthy', 99), ranking: { score: 10, itemCount: 4 } },
		{ name: '@b', health: health('healthy', 10), ranking: { score: 70, itemCount: 4 } },
		{ name: '@c', health: health('healthy', 50) },
		{ name: '@d', health: health('healthy', 50), ranking: { score: 99, itemCount: 0 } },
	];
	assert.deepEqual(rank(dir, payload, NOW).map((r) => r.name), ['@b', '@a', '@c', '@d']);
});

test('a query matches name or description with spaces and @ left out, ten to a page, the page held to the last one', () => {
	const dir = rank(Array.from({ length: 23 }, (_, i) => entry(`@kit-${String(i).padStart(2, '0')}`, i === 5 ? 'Shadcn blocks for magic UI' : 'Components')), undefined, NOW);
	const logos = Object.fromEntries(dir.map((r) => [r.logo, `/logos/${r.logo}.svg`]));
	const all = directoryView(dir, logos, '/docs/directory', '', 9);
	assert.equal(all.page, 3);
	assert.equal(all.rows.length, 3);
	assert.equal(all.count, 23);
	assert.equal(all.countLabel, 'registries');
	assert.equal(all.next.href, undefined);
	assert.equal(all.next.disabled, 'true');
	assert.equal(all.previous.href, '/docs/directory?page=2');
	assert.equal(all.rows[0]!.logo, '/logos/kit-20.svg#logo');
	assert.deepEqual(all.rows.map((r) => r.last), [false, false, true]);
	const one = directoryView(dir, logos, '/docs/directory', 'magic u', 1);
	assert.deepEqual([one.count, one.countLabel, one.rows[0]!.name, one.navHidden], [1, 'registry', '@kit-05', true]);
	assert.equal(directoryView(dir, logos, '/docs/directory', '@KIT-1', 1).count, 10);
	assert.equal(one.rows[0]!.href, 'https://kit-05.dev/?utm_source=ui.shadcn.com&utm_medium=referral&utm_campaign=directory');
});

test('page links keep the query and leave out page 1', () => {
	assert.equal(pageHref('/docs/directory', 'magic ui', 1), '/docs/directory?q=magic+ui');
	assert.equal(pageHref('/docs/directory', 'magic', 3), '/docs/directory?q=magic&page=3');
	assert.equal(pageHref('/docs/directory', '', 1), '/docs/directory');
});
