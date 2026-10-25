import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deployFingerprint, NetworkCache } from '../src/check/slow-network-cache.ts';
import { measureSlowNetwork, type NetworkRun } from '../src/check/slow-network.ts';

test('a deploy is known by the files its HTML names, not by text that changes on every request', () => {
	const page = (asset: string, nonce: string) => `<html><head><link rel="stylesheet" href="/_next/static/${asset}.css"><script src="/build/chunk-a1.js"></script></head><body data-nonce="${nonce}">x</body></html>`;
	assert.equal(deployFingerprint(page('app-1', 'n1')), deployFingerprint(page('app-1', 'n2')));
	assert.notEqual(deployFingerprint(page('app-1', 'n1')), deployFingerprint(page('app-2', 'n1')));
	assert.notEqual(deployFingerprint('<p>one</p>'), deployFingerprint('<p>two</p>'), 'with no files named, the HTML itself');
});

test("the old page's runs are taken from the cache for the same deploy, network, browser and run count; the new page is always measured", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'slow-network-cache-'));
	try {
		const cache = new NetworkCache(dir);
		const ran: string[] = [];
		const fake = async (url: string): Promise<NetworkRun> => (ran.push(url), { firstFrame: 900, answered: 2000, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });
		const options = { profiles: ['regular-3g'], browsers: ['chromium' as const], runs: 4, runner: fake, cache: { store: cache, deploys: { 'https://old.example/': 'deploy-1' }, reuse: ['https://old.example/'] } };
		const first = await measureSlowNetwork(['https://old.example/', 'https://new.example/'], options);
		assert.equal(ran.filter((u) => u.includes('old')).length, 4);
		assert.equal(first[0]!.cells[0]!.cached, undefined);
		ran.length = 0;
		const second = await measureSlowNetwork(['https://old.example/', 'https://new.example/'], options);
		assert.deepEqual(ran, Array(4).fill('https://new.example/'));
		assert.equal(second[0]!.cells[0]!.cached, true);
		assert.equal(second[0]!.cells[0]!.median.answered, 2000);
		ran.length = 0;
		await measureSlowNetwork(['https://old.example/', 'https://new.example/'], { ...options, cache: { ...options.cache, deploys: { 'https://old.example/': 'deploy-2' } } });
		assert.equal(ran.filter((u) => u.includes('old')).length, 4, 'a new deploy is measured again');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a DevTools profile in a browser without DevTools throttling is a skipped cell, said so', async () => {
	const fake = async (): Promise<NetworkRun> => ({ answered: 1, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });
	const [side] = await measureSlowNetwork(['https://a.example/'], { profiles: ['chrome-slow-4g'], browsers: ['firefox'], runs: 1, runner: fake });
	assert.match(side!.cells[0]!.unavailable ?? '', /Chrome DevTools throttling, which only Chromium has/);
});
