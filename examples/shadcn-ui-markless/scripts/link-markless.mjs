// Points every @markless/* dependency of the app, and every transitive one through npm overrides, at the packed tarballs.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const [app, out] = process.argv.slice(2);
const file = `${app}/package.json`;
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const local = Object.fromEntries(readdirSync(out).map((f) => [`@markless/${f.replace(/^markless-/, '').replace(/-\d+\.\d+\.\d+.*\.tgz$/, '')}`, `file:./.markless-local/${f}`]));
for (const section of ['dependencies', 'devDependencies']) for (const name of Object.keys(pkg[section] ?? {})) if (local[name]) pkg[section][name] = local[name];
pkg.overrides = { ...pkg.overrides, ...local };
writeFileSync(file, `${JSON.stringify(pkg, null, '\t')}\n`);
