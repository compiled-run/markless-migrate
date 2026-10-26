import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { classTokens, usedCss, usedStylesheets } from '../src/convert/used-css.ts';

const SHEET = [
	'@layer theme,base,utilities;',
	'@font-face{font-family:Geist;src:url(../media/g.woff2)}',
	':root{--x:1}',
	'@layer utilities{',
	'.flex{display:flex}',
	'.grid{display:grid}',
	'.\\[\\&\\>svg\\]\\:size-4>svg{width:1rem}',
	'.data-\\[state\\=open\\]\\:block[data-state=open]{display:block}',
	'.dark\\:bg-black:is(.dark *){background:#000}',
	'.hover\\:underline:hover{text-decoration:underline}',
	'.w-\\(--sidebar-width\\){width:var(--sidebar-width)}',
	'.unused-a,.flex-col{flex-direction:column}',
	'.unused-b .flex{color:red}',
	'.flex:not(.unused-c){color:blue}',
	'.group:has(.unused-d) .flex{color:green}',
	'.card{padding:1rem;&:hover{padding:2rem}& .unused-e{margin:0}}',
	'#main{margin:0}#gone{margin:1px}',
	'}',
	'@media (min-width:40rem){.sm\\:grid{display:grid}.unused-f{display:none}}',
	'@media print{.unused-g{display:none}}',
	'@keyframes spin{to{transform:rotate(1turn)}}',
	'[data-slot=tabs]{gap:1rem}',
	'button{cursor:pointer}',
].join('');

const MARKUP = `<div id="main" class="flex [&amp;&gt;svg]:size-4 data-[state=open]:block dark:bg-black hover:underline card sm:grid"><span class={"w-(--sidebar-width) flex-col"}></span></div>
<script>document.documentElement.classList.add('dark')</script>`;

test('a stylesheet keeps the rules whose classes and ids the page can hold, byte for byte and in order; the rest go', () => {
	const out = usedCss(SHEET, classTokens([MARKUP]));
	assert.equal(
		out,
		[
			'@layer theme,base,utilities;',
			'@font-face{font-family:Geist;src:url(../media/g.woff2)}',
			':root{--x:1}',
			'@layer utilities{',
			'.flex{display:flex}',
			'.\\[\\&\\>svg\\]\\:size-4>svg{width:1rem}',
			'.data-\\[state\\=open\\]\\:block[data-state=open]{display:block}',
			'.dark\\:bg-black:is(.dark *){background:#000}',
			'.hover\\:underline:hover{text-decoration:underline}',
			'.w-\\(--sidebar-width\\){width:var(--sidebar-width)}',
			'.unused-a,.flex-col{flex-direction:column}',
			'.flex:not(.unused-c){color:blue}',
			'.card{padding:1rem;&:hover{padding:2rem}}',
			'#main{margin:0}',
			'}',
			'@media (min-width:40rem){.sm\\:grid{display:grid}}',
			'@keyframes spin{to{transform:rotate(1turn)}}',
			'[data-slot=tabs]{gap:1rem}',
			'button{cursor:pointer}',
		].join(''),
	);
});

test("a class holding quotes, brackets and parentheses is found whole, in markup and in code", () => {
	const sheet = ".\\[\\&_svg\\:not\\(\\[class\\*\\=\\'size-\\'\\]\\)\\]\\:size-4 svg:not([class*=size-]){width:1rem}.before\\:content-\\[\\'x\\'\\]:before{content:'x'}.after\\:content-\\[\\\"y\\\"\\]:after{content:\"y\"}.gone{a:b}";
	const html = `<button class="[&amp;_svg:not([class*='size-'])]:size-4 px-2"></button><b class="after:content-[&quot;y&quot;]"></b>`;
	const code = `const c={"x":"before:content-['x'] flex"};`;
	assert.equal(usedCss(sheet, classTokens([html, code])), sheet.replace('.gone{a:b}', ''));
});

test('a selector the parser cannot read is kept', () => {
	const sheet = '.flex{display:flex}.a:unknown-thing((){color:red}';
	assert.equal(usedCss(sheet, classTokens(['flex'])), sheet);
});

test("each page links a cut copy of its stylesheet beside the original, holding what its modules, the Document's, lib/ and its served layers can show", async () => {
	const app = await mkdtemp(join(tmpdir(), 'mm-used-css-'));
	const files: Record<string, string> = {
		'document.tsrx': "import Extras from './components/converted/body-extras.tsrx';\n<body class=\"doc\"><Extras /></body>",
		'components/converted/body-extras.tsrx': '<template data-mm-layer-src="/_converted/layers/abc.html"></template>',
		'public/_converted/layers/abc.html': '<div class="in-layer"></div>',
		'lib/parts/theme.ts': "document.documentElement.classList.add('from-script')",
		'components/converted/nav.tsrx': '<nav class="nav"></nav>',
		'pages/a.tsrx': "import Nav from '../components/converted/nav.tsrx';\n<div class={\"only-a\"}><Nav /></div>",
		'pages/b.tsrx': '<div class="only-b"></div>',
		'public/_next/css/site.css': '.doc{a:1}.in-layer{a:2}.from-script{a:3}.nav{a:4}.only-a{a:5}.only-b{a:6}.on-html{a:7}.nowhere{a:8}@font-face{src:url(../media/f.woff2)}',
		'public/_next/css/small.css': '.doc{b:1}',
	};
	for (const [file, text] of Object.entries(files)) {
		await mkdir(dirname(join(app, file)), { recursive: true });
		await writeFile(join(app, file), text);
	}
	const link = (href: string) => ({ tag: 'link', attrs: { rel: 'stylesheet', href } as Record<string, string> });
	const head: { tag: string; attrs: Record<string, string> }[] = [link('/_next/css/site.css'), link('/_next/css/small.css'), link('https://cdn.example/x.css'), { tag: 'meta', attrs: { charset: 'utf-8' } }];
	try {
		const out = await usedStylesheets(
			app,
			new Map([
				['/a', { page: 'pages/a.tsrx', head, texts: ['{"class":"on-html"}'] }],
				['/b', { page: 'pages/b.tsrx', head, texts: [] }],
			]),
		);
		const a = out.heads.get('/a')!;
		const b = out.heads.get('/b')!;
		assert.match(a[0]!.attrs.href!, /^\/_next\/css\/site\.used-[0-9a-f]{12}\.css$/, 'beside the original, so ../media/f.woff2 still resolves');
		assert.deepEqual(a.slice(1), head.slice(1), 'a sheet every rule of which stays, another origin\'s sheet and other tags are as they were');
		assert.equal(await readFile(join(app, 'public', a[0]!.attrs.href!), 'utf8'), '.doc{a:1}.in-layer{a:2}.from-script{a:3}.nav{a:4}.only-a{a:5}.on-html{a:7}@font-face{src:url(../media/f.woff2)}');
		assert.equal(await readFile(join(app, 'public', b[0]!.attrs.href!), 'utf8'), '.doc{a:1}.in-layer{a:2}.from-script{a:3}.only-b{a:6}@font-face{src:url(../media/f.woff2)}');
		assert.equal(out.sheets, 2);
	} finally {
		await rm(app, { recursive: true, force: true });
	}
});

test("a late face's @font-face leaves the page's stylesheet, its url() resolved from the stylesheet's path", () => {
	const sheet = '@font-face{font-family:Geist;src:url(../media/geist.woff2)format("woff2");font-display:swap}@layer base{@font-face{font-family:"Noto Sans Arabic";font-style:normal;font-weight:100 900;src:url(../media/arabic.woff2)format("woff2");unicode-range:U+6??,U+750-77F;font-display:swap}}.flex{display:flex}';
	const out = usedCss(sheet, classTokens(['flex']), { sheet: '/_next/static/chunks/site.css', withheld: new Set(['/_next/static/media/arabic.woff2']) });
	assert.equal(out, '@font-face{font-family:Geist;src:url(../media/geist.woff2)format("woff2");font-display:swap}@layer base{}.flex{display:flex}');
});
