// node freeze-old.mjs <app dir>: the old build served as built. A page whose data has a revalidate window (the header's
// GitHub star count, 1 day) is otherwise served stale once the window passes and rendered again in the background, so two
// loads of one route in one run can differ.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.argv[2] ?? '.', '.next', 'prerender-manifest.json');
const manifest = JSON.parse(readFileSync(file, 'utf8'));
let frozen = 0;
for (const route of Object.values(manifest.routes)) {
	if (route.initialRevalidateSeconds === false) continue;
	route.initialRevalidateSeconds = false;
	frozen++;
}
writeFileSync(file, JSON.stringify(manifest));
console.log(`freeze-old: ${frozen} of ${Object.keys(manifest.routes).length} prerendered routes no longer revalidate`);
