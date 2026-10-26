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

test("the old page's runs come from the cache while two fresh runs of it land among them; when they do not, the old page is measured again", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'slow-network-cache-'));
	try {
		const cache = new NetworkCache(dir);
		const ran: string[] = [];
		let oldAt = 2000;
		const fake = async (url: string): Promise<NetworkRun> => (ran.push(url), { firstFrame: 900, answered: url.includes('old') ? oldAt + 10 * (ran.length % 3) : 2000, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });
		const options = { profiles: ['regular-3g'], browsers: ['chromium' as const], runs: 5, runner: fake, cache: { store: cache, deploys: { 'https://old.example/': 'deploy-1' }, reuse: ['https://old.example/'] } };
		const urls = ['https://old.example/', 'https://new.example/'];
		const first = await measureSlowNetwork(urls, options);
		assert.equal(ran.filter((u) => u.includes('old')).length, 5);
		assert.equal(first[0]!.cells[0]!.cached, undefined);
		ran.length = 0;
		const second = await measureSlowNetwork(urls, options);
		assert.equal(ran.filter((u) => u.includes('old')).length, 2, 'two fresh runs check the cached ones');
		assert.equal(ran.filter((u) => u.includes('new')).length, 5);
		assert.equal(second[0]!.cells[0]!.cached, true);
		assert.equal(second[0]!.cells[0]!.runs.length, 7, 'the cached runs and the two fresh ones');
		ran.length = 0;
		oldAt = 3000;
		const drifted = await measureSlowNetwork(urls, options);
		assert.equal(ran.filter((u) => u.includes('old')).length, 5, 'the fresh runs disagree: all five again');
		assert.equal(drifted[0]!.cells[0]!.cached, undefined);
		assert.ok(drifted[0]!.cells[0]!.runs.every((r) => r.answered! >= 3000));
		ran.length = 0;
		await measureSlowNetwork(urls, { ...options, cache: { ...options.cache, deploys: { 'https://old.example/': 'deploy-2' } } });
		assert.equal(ran.filter((u) => u.includes('old')).length, 5, 'a new deploy is measured again');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a DevTools profile in a browser without DevTools throttling is a skipped cell, said so', async () => {
	const fake = async (): Promise<NetworkRun> => ({ answered: 1, clicks: 1, bytes: 1, jsDownloaded: 1, requests: [] });
	const [side] = await measureSlowNetwork(['https://a.example/'], { profiles: ['chrome-slow-4g'], browsers: ['firefox'], runs: 1, runner: fake });
	assert.match(side!.cells[0]!.unavailable ?? '', /Chrome DevTools throttling, which only Chromium has/);
});
