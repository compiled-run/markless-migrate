// Child process for ideal-image.mjs: runs the ideal-image plugin's two loaders (responsive images, then the
// low-quality placeholder) on one image and prints the module they produce and the files they emit.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [path, packages, optionsJson] = process.argv.slice(2);
const pluginRequire = createRequire(join(packages, 'docusaurus-plugin-ideal-image/package.json'));
const responsive = pluginRequire('@docusaurus/responsive-loader');
const lqip = pluginRequire('@docusaurus/lqip-loader');
const options = { emitFile: true, adapter: pluginRequire('@docusaurus/responsive-loader/sharp'), name: 'assets/ideal-img/[name].[hash:hex:7].[width].[ext]', ...JSON.parse(optionsJson) };
const emitted = {};
function run(loader, input, query = '') {
	return new Promise((resolve, reject) => {
		const fn = loader.default ?? loader;
		const ctx = {
			resourcePath: path,
			resourceQuery: query,
			resource: path + query,
			rootContext: process.cwd(),
			context: process.cwd(),
			mode: 'production',
			getOptions: () => options,
			query: options,
			options: {},
			cacheable() {},
			addDependency() {},
			emitFile(name, buffer) {
				emitted[name] = Buffer.from(buffer).toString('base64');
			},
			async: () => (error, result) => (error ? reject(error) : resolve(result)),
			callback: (error, result) => (error ? reject(error) : resolve(result)),
			_compiler: { outputPath: '/', options: { output: { publicPath: '/' } } },
			_compilation: { outputOptions: { publicPath: '/' } },
		};
		const out = fn.call(ctx, input);
		if (out !== undefined && typeof out.then !== 'function') resolve(out);
	});
}
const source = await run(responsive, readFileSync(path));
const module = await run(lqip, Buffer.from(String(source)));
process.stdout.write(JSON.stringify({ module: String(module), emitted }));
