// Points every @markless/* dependency of the app, and every transitive one through npm overrides, at the packed tarballs.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const [app, out] = process.argv.slice(2);
const file = `${app}/package.json`;
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const local = Object.fromEntries(readdirSync(out).map((f) => [`@markless/${f.replace(/^markless-/, '').replace(/-\d+\.\d+\.\d+.*\.tgz$/, '')}`, `file:./.markless-local/${f}`]));
for (const section of ['dependencies', 'devDependencies']) for (const name of Object.keys(pkg[section] ?? {})) if (local[name]) pkg[section][name] = local[name];
pkg.overrides = { ...pkg.overrides, ...local };
writeFileSync(file, `${JSON.stringify(pkg, null, '\t')}\n`);
// The tarballs keep their version across rebuilds, so the lockfile's integrity for them is stale: drop their entries.
const lockFile = `${app}/package-lock.json`;
try {
	const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
	for (const key of Object.keys(lock.packages ?? {})) if (key.includes('node_modules/@markless/') || String(lock.packages[key].resolved ?? '').includes('.markless-local')) delete lock.packages[key];
	writeFileSync(lockFile, `${JSON.stringify(lock, null, '\t')}\n`);
} catch {}
