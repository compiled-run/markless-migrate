// Raw and gzip (level 6) bytes of every built HTML file under a directory. Usage: node html-sizes.cjs <root> <out.json>
const { readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { gzipSync } = require('node:zlib');

const [root, out] = process.argv.slice(2);
const sizes = {};
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (name.endsWith('.html')) {
			const bytes = readFileSync(path);
			sizes[path.slice(root.length)] = { raw: bytes.length, gzip: gzipSync(bytes, { level: 6 }).length };
		}
	}
};
walk(root);
writeFileSync(out, JSON.stringify(sizes, null, 1));
console.log(Object.keys(sizes).length, 'html files');
