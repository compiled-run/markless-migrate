#!/usr/bin/env node
// The original's dataset as release assets of the original's own release (original-<site>-<originalId12>):
//   node scripts/original-dataset.ts upload <dir> --tag <tag>
//       one asset per route bucket (its tables and blobs), one for the site-wide tables, then the manifest last: the commit point
//   node scripts/original-dataset.ts download --tag <tag> --targets <file> --out <dir> [--name <dataset>]
//       the manifest, the site-wide tables and the buckets of the targets' routes only
//   node scripts/original-dataset.ts name <dir>
//       the dataset's asset prefix: dataset-<producer versions>-<conditions>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { digest } from '../src/data/codec.ts';
import { bucketOf, SITE_TABLES, TABLES, type Manifest } from '../src/data/original/dataset.ts';
import { readLock } from '../src/data/original/lock.ts';
import { blobsDir, tableFile } from '../src/data/original/store.ts';

const [command, ...args] = process.argv.slice(2);
const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { tag: { type: 'string' }, targets: { type: 'string' }, out: { type: 'string' }, name: { type: 'string' }, repo: { type: 'string' } } });
const repo = values.repo ?? process.env.GITHUB_REPOSITORY;
const gh = (...a: string[]) => execFileSync('gh', [...a, ...(repo ? ['-R', repo] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

/** A dataset's assets are named by the producer versions it holds and the conditions it was produced under. */
export const datasetName = (manifest: Manifest): string => `dataset-${digest(TABLES.map((t) => manifest.tables[t].producerVersion)).slice(0, 8)}-${manifest.conditionsId.slice(0, 12)}`;
const pad = (b: number) => String(b).padStart(2, '0');

function pack(dir: string, files: readonly string[], to: string): void {
	const present = files.filter((f) => existsSync(join(dir, f)));
	if (!present.length) return;
	execFileSync('sh', ['-c', `tar -C "$0" -cf - "$@" | zstd -T0 -3 -q -o "${to}"`, dir, ...present]);
}

function unpack(file: string, dir: string): void {
	mkdirSync(dir, { recursive: true });
	execFileSync('sh', ['-c', `zstd -d -q -c "$0" | tar -C "$1" -xf -`, file, dir]);
}

const manifestOf = (dir: string) => JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;

if (command === 'name') {
	process.stdout.write(`${datasetName(manifestOf(resolve(positionals[0] ?? '.')))}\n`);
} else if (command === 'upload') {
	const dir = resolve(positionals[0] ?? '');
	if (!values.tag || !existsSync(join(dir, 'manifest.json'))) throw new Error('upload <committed dataset dir> --tag <the original release>');
	const manifest = manifestOf(dir);
	const name = datasetName(manifest);
	const already = gh('release', 'view', values.tag, '--json', 'assets', '--jq', '.assets[].name').split('\n');
	if (already.includes(`${name}-manifest.json`)) throw new Error(`${values.tag} already holds the dataset ${name}: a dataset is published once`);
	const stage = join(tmpdir(), `original-dataset-${process.pid}`);
	rmSync(stage, { recursive: true, force: true });
	mkdirSync(stage, { recursive: true });
	const buckets = [...new Set(TABLES.flatMap((t) => manifest.tables[t].buckets))].sort((a, b) => a - b);
	const assets: string[] = [];
	for (const b of buckets) {
		const to = join(stage, `${name}-bucket-${pad(b)}.tar.zst`);
		pack(dir, [...TABLES.filter((t) => !SITE_TABLES.has(t)).map((t) => tableFile(t, b)), blobsDir(b)], to);
		if (existsSync(to)) assets.push(to);
	}
	const site = join(stage, `${name}-site.tar.zst`);
	pack(dir, [...[...SITE_TABLES].map((t) => tableFile(t)), blobsDir()], site);
	if (existsSync(site)) assets.push(site);
	// Release assets stop at 1,000 a release: upload a few at a time, the manifest after every bucket.
	for (let i = 0; i < assets.length; i += 16) gh('release', 'upload', values.tag, ...assets.slice(i, i + 16));
	execFileSync('cp', [join(dir, 'manifest.json'), join(stage, `${name}-manifest.json`)]);
	gh('release', 'upload', values.tag, join(stage, `${name}-manifest.json`));
	rmSync(stage, { recursive: true, force: true });
	process.stdout.write(`published ${name} to ${values.tag}: ${assets.length} assets and its manifest\n`);
} else if (command === 'download') {
	if (!values.tag || !values.targets || !values.out) throw new Error('download --tag <the original release> --targets <file> --out <dir> [--name <dataset>]');
	const lock = await readLock();
	const out = resolve(values.out);
	mkdirSync(out, { recursive: true });
	const names = gh('release', 'view', values.tag, '--json', 'assets', '--jq', '.assets[].name').split('\n').filter((n) => /^dataset-.+-manifest\.json$/.test(n)).map((n) => n.replace(/-manifest\.json$/, ''));
	const wanted = digest(TABLES.map((t) => lock.producers[t].version)).slice(0, 8);
	const choices = values.name ? names.filter((n) => n === values.name) : names.filter((n) => n.startsWith(`dataset-${wanted}-`));
	if (choices.length !== 1) throw new Error(`${values.tag} holds ${choices.length ? `${choices.length} datasets of this checker's producer versions (${choices.join(', ')}): name one with --name` : `no dataset of this checker's producer versions (${wanted}); it holds ${names.join(', ') || 'none'}`}`);
	const name = choices[0]!;
	gh('release', 'download', values.tag, '-p', `${name}-manifest.json`, '-D', out, '--clobber');
	execFileSync('mv', [join(out, `${name}-manifest.json`), join(out, 'manifest.json')]);
	const manifest = manifestOf(out);
	const routes = (JSON.parse(readFileSync(resolve(values.targets), 'utf8')) as { routes: string[] }).routes;
	const held = new Set(TABLES.flatMap((t) => manifest.tables[t].buckets));
	const buckets = [...new Set(routes.map(bucketOf))].filter((b) => held.has(b));
	const patterns = [...buckets.map((b) => `${name}-bucket-${pad(b)}.tar.zst`), `${name}-site.tar.zst`];
	const stage = join(out, '.download');
	mkdirSync(stage, { recursive: true });
	for (const p of patterns) {
		try {
			gh('release', 'download', values.tag, '-p', p, '-D', stage, '--clobber');
		} catch (error) {
			if (!p.endsWith('-site.tar.zst')) throw error;
		}
	}
	for (const f of readdirSync(stage)) unpack(join(stage, f), out);
	rmSync(stage, { recursive: true, force: true });
	process.stdout.write(`downloaded ${name}: ${buckets.length} of ${held.size} buckets for ${routes.length} routes\n`);
} else {
	process.stderr.write('usage: original-dataset.ts upload <dir> --tag <tag> | download --tag <tag> --targets <file> --out <dir> [--name <dataset>] | name <dir>\n');
	process.exit(2);
}
