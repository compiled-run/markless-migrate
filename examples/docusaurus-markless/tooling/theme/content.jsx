// The MDX components, ported from theme-classic and theme-common: headings, links, code blocks (tokenized by
// Prism at import time, in the styles the old theme applies once a page has started), admonitions, tabs,
// details, inline tables of contents and images.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { clsx, useContext, styles, ThemeClassNames, translate, Translate, Link, Heading, useAnchorTargetClassName, themeConfig, IconCopy, IconSuccess, Head, BrowserOnly, ThemedImage, isInternalUrl } from './core.jsx';
import { TOCItems } from './docs.jsx';
import Playground from './Playground.jsx';
import { isElement, toArray, Fragment, isReactServerMarkup, render, withContext, toHtml } from '../source/h.mjs';
import { website } from '../source/site.mjs';

const require = createRequire(join(website, 'package.json'));
const { Prism, normalizeTokens } = require('prism-react-renderer');
{
	const before = globalThis.Prism;
	globalThis.Prism = Prism;
	const templating = ['django', 'ejs', 'erb', 'etlua', 'ftl', 'handlebars', 'latte', 'liquid', 'php', 'smarty', 'soy', 'tt2', 'twig'];
	for (const lang of ['java', 'latex', 'haskell', 'matlab', 'PHp', 'powershell', 'bash', 'diff', 'json', 'scss']) {
		if (templating.includes(lang.toLowerCase())) require('prismjs/components/prism-markup-templating.js');
		require(`prismjs/components/prism-${lang.toLowerCase()}`);
	}
	globalThis.Prism = before;
}

// How the browser writes back a style React set through the DOM: `name: value;`, colours as rgb().
const kebab = (name) => (name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
function cssColor(value) {
	const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
	if (!hex) return value;
	let digits = hex[1];
	if (digits.length === 3 || digits.length === 4) digits = [...digits].map((c) => c + c).join('');
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
	if (digits.length === 8) {
		const alpha = Math.round((parseInt(digits.slice(6, 8), 16) / 255) * 1000) / 1000;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	return `rgb(${r}, ${g}, ${b})`;
}
export function domStyle(style) {
	if (isReactServerMarkup()) return style;
	const parts = Object.entries(style ?? {})
		.filter(([, v]) => v !== undefined && v !== null && v !== '')
		.map(([name, value]) => `${kebab(name)}: ${name.startsWith('--') ? value : /color/i.test(name) ? cssColor(String(value)) : value};`);
	return parts.length ? parts.join(' ') : undefined;
}

export function themeToDict(theme, language) {
	const dict = theme.styles.reduce((acc, entry) => {
		if (entry.languages && !entry.languages.includes(language)) return acc;
		for (const type of entry.types) acc[type] = { ...acc[type], ...entry.style };
		return acc;
	}, {});
	dict.root = theme.plain;
	dict.plain = { ...theme.plain, backgroundColor: undefined };
	return dict;
}
export function tokenStyle(dict, { types, empty }) {
	if (types.length === 1 && types[0] === 'plain') return empty != null ? { display: 'inline-block' } : undefined;
	if (types.length === 1 && empty != null) return dict[types[0]];
	return Object.assign(empty != null ? { display: 'inline-block' } : {}, ...types.map((type) => dict[type]));
}

export function tokenize(code, language) {
	const grammar = Prism.languages[language];
	if (grammar == null) return normalizeTokens([code]);
	const env = { code, grammar, language, tokens: [] };
	Prism.hooks.run('before-tokenize', env);
	env.tokens = Prism.tokenize(code, grammar);
	Prism.hooks.run('after-tokenize', env);
	return normalizeTokens(env.tokens);
}

// theme-common's code block metadata: language, title, line numbers, and the magic comments' line classes.
const commentPatterns = {
	js: { start: '\\/\\/', end: '' },
	jsBlock: { start: '\\/\\*', end: '\\*\\/' },
	jsx: { start: '\\{\\s*\\/\\*', end: '\\*\\/\\s*\\}' },
	bash: { start: '#', end: '' },
	html: { start: '<!--', end: '-->' },
	lua: { start: '--', end: '' },
	wasm: { start: '\\;\\;', end: '' },
	tex: { start: '%', end: '' },
	vb: { start: "['‘’]", end: '' },
	vbnet: { start: "(?:_\\s*)?['‘’]", end: '' },
	rem: { start: '[Rr][Ee][Mm]\\b', end: '' },
	f90: { start: '!', end: '' },
	ml: { start: '\\(\\*', end: '\\*\\)' },
	cobol: { start: '\\*>', end: '' },
};
const popular = ['js', 'jsBlock', 'jsx', 'bash', 'html'];
function commentPattern(languages, directives) {
	const pattern = languages.map((lang) => `(?:${commentPatterns[lang].start}\\s*(${directives.flatMap((d) => [d.line, d.block?.start, d.block?.end].filter(Boolean)).join('|')})\\s*${commentPatterns[lang].end})`).join('|');
	return new RegExp(`^\\s*(?:${pattern})\\s*$`);
}
function directiveStyles(lang, directives) {
	const byLang = {
		js: ['js', 'jsBlock'], javascript: ['js', 'jsBlock'], ts: ['js', 'jsBlock'], typescript: ['js', 'jsBlock'],
		jsx: ['js', 'jsBlock', 'jsx'], tsx: ['js', 'jsBlock', 'jsx'], html: ['js', 'jsBlock', 'html'],
		python: ['bash'], py: ['bash'], bash: ['bash'], markdown: ['html', 'jsx', 'bash'], md: ['html', 'jsx', 'bash'],
		tex: ['tex'], latex: ['tex'], matlab: ['tex'], lua: ['lua'], haskell: ['lua'], sql: ['lua', 'jsBlock'], wasm: ['wasm'],
		vb: ['vb', 'rem'], vba: ['vb', 'rem'], 'visual-basic': ['vb', 'rem'], vbnet: ['vbnet', 'rem'], batch: ['rem'], basic: ['rem', 'f90'],
		fsharp: ['js', 'ml'], ocaml: ['ml'], sml: ['ml'], fortran: ['f90'], cobol: ['cobol'],
	};
	return commentPattern(byLang[lang] ?? popular, directives);
}
function rangeParser(text) {
	const out = [];
	for (const part of text.split(',')) {
		const m = /^\s*(-?\d+)\s*(?:(-|\.\.\.?)\s*(-?\d+))?\s*$/.exec(part);
		if (!m) continue;
		const start = Number(m[1]);
		if (m[3] === undefined) out.push(start);
		else {
			const end = Number(m[3]) - (m[2] === '...' ? 1 : 0);
			for (let i = start; i <= end; i++) out.push(i);
		}
	}
	return out;
}
function parseLines(code, { metastring, magicComments, language }) {
	const text = code.replace(/\r?\n$/, '');
	const range = /\{(?<range>[\d,-]+)\}/.exec(metastring ?? '');
	if (metastring && range) {
		const cls = magicComments[0].className;
		return { lineClassNames: Object.fromEntries(rangeParser(range.groups.range).filter((n) => n > 0).map((n) => [n - 1, [cls]])), code: text };
	}
	if (language === undefined) return { lineClassNames: {}, code: text };
	const regex = directiveStyles(language, magicComments);
	const lines = text.split(/\r?\n/);
	const blocks = Object.fromEntries(magicComments.map((d) => [d.className, { start: 0, range: '' }]));
	const lineTo = Object.fromEntries(magicComments.filter((d) => d.line).map(({ className, line }) => [line, className]));
	const startTo = Object.fromEntries(magicComments.filter((d) => d.block).map(({ className, block }) => [block.start, className]));
	const endTo = Object.fromEntries(magicComments.filter((d) => d.block).map(({ className, block }) => [block.end, className]));
	for (let n = 0; n < lines.length; ) {
		const match = lines[n].match(regex);
		if (!match) {
			n += 1;
			continue;
		}
		const directive = match.slice(1).find((item) => item !== undefined);
		if (lineTo[directive]) blocks[lineTo[directive]].range += `${n},`;
		else if (startTo[directive]) blocks[startTo[directive]].start = n;
		else if (endTo[directive]) blocks[endTo[directive]].range += `${blocks[endTo[directive]].start}-${n - 1},`;
		lines.splice(n, 1);
	}
	const lineClassNames = {};
	for (const [className, { range: r }] of Object.entries(blocks)) for (const l of rangeParser(r)) (lineClassNames[l] ??= []).push(className);
	return { code: lines.join('\n'), lineClassNames };
}
function createCodeBlockMetadata({ code, className, metastring, magicComments, defaultLanguage, language: lang, title, showLineNumbers }) {
	const classLanguage = className?.split(' ').find((s) => s.startsWith('language-'))?.replace(/language-/, '');
	const language = (lang ?? classLanguage ?? defaultLanguage)?.toLowerCase() ?? 'text';
	const parsed = parseLines(code, { metastring, magicComments, language });
	const meta = metastring?.split(' ').find((s) => s.startsWith('showLineNumbers'));
	const lineNumbersStart = typeof showLineNumbers === 'boolean' ? (showLineNumbers ? 1 : undefined) : typeof showLineNumbers === 'number' ? showLineNumbers : meta ? (meta.startsWith('showLineNumbers=') ? parseInt(meta.replace('showLineNumbers=', ''), 10) : 1) : undefined;
	return {
		code: parsed.code,
		className: clsx(className, language && !className?.includes(`language-${language}`) && `language-${language}`),
		language,
		title: metastring?.match(/title=(?<quote>["'])(?<title>.*?)\1/)?.groups.title || title,
		lineNumbersStart,
		lineClassNames: parsed.lineClassNames,
	};
}

function prismVariables(theme) {
	const out = {};
	if (typeof theme.plain.color === 'string') out['--prism-color'] = theme.plain.color;
	if (typeof theme.plain.backgroundColor === 'string') out['--prism-background-color'] = theme.plain.backgroundColor;
	return out;
}

function CodeBlockContainer({ as: As, ...props }) {
	return <As {...props} style={domStyle(prismVariables(themeConfig().prism.theme))} className={clsx(props.className, styles('CodeBlock/Container').codeBlockContainer, ThemeClassNames.common.codeBlock)} />;
}

function CopyButton() {
	const s = styles('CodeBlock/Buttons/CopyButton');
	return (
		<button type="button" aria-label={translate({ id: 'theme.CodeBlock.copyButtonAriaLabel', message: 'Copy code to clipboard' })} title={translate({ id: 'theme.CodeBlock.copy', message: 'Copy' })} className={clsx('clean-btn', s.copyButton)}>
			<span className={s.copyButtonIcons} aria-hidden="true">
				<IconCopy className={s.copyButtonIcon} />
				<IconSuccess className={s.copyButtonSuccessIcon} />
			</span>
		</button>
	);
}

function CodeBlockString({ children, className, metastring, title, showLineNumbers, language }) {
	const { prism } = themeConfig();
	const metadata = createCodeBlockMetadata({ code: children, className, metastring, magicComments: prism.magicComments, defaultLanguage: prism.defaultLanguage, language, title, showLineNumbers });
	const layout = styles('CodeBlock/Layout');
	const content = styles('CodeBlock/Content');
	const line = styles('CodeBlock/Line');
	const dict = themeToDict(prism.theme, metadata.language);
	const lines = tokenize(metadata.code, metadata.language);
	const numbered = metadata.lineNumbersStart !== undefined;
	return (
		<CodeBlockContainer as="div" className={metadata.className}>
			{metadata.title && <div className={layout.codeBlockTitle}>{metadata.title}</div>}
			<div className={layout.codeBlockContent}>
				<pre tabIndex={0} style={domStyle(dict.root)} className={clsx(`prism-code language-${metadata.language}`, content.codeBlock, 'thin-scrollbar')}>
					<code className={clsx(content.codeBlockLines, numbered && content.codeBlockLinesWithNumbering)} style={numbered ? domStyle({ counterReset: `line-count ${metadata.lineNumbersStart - 1}` }) : undefined}>
						{lines.map((rawLine, i) => {
							const tokens = rawLine.length === 1 && rawLine[0].content === '\n' ? [{ ...rawLine[0], content: '' }] : rawLine;
							const spans = tokens.map((token) => (
								<span className={clsx('token', ...token.types)} style={domStyle(tokenStyle(dict, token))}>
									{token.content}
								</span>
							));
							return (
								<div className={clsx('token-line', metadata.lineClassNames[i], numbered && line.codeLine)} style={domStyle(dict.plain)}>
									{numbered ? (
										<>
											<span className={line.codeLineNumber} />
											<span className={line.codeLineContent}>{spans}</span>
										</>
									) : (
										spans
									)}
									<br />
								</div>
							);
						})}
					</code>
				</pre>
				<BrowserOnly>
					{() => (
						<div className={styles('CodeBlock/Buttons').buttonGroup}>
							<CopyButton />
						</div>
					)}
				</BrowserOnly>
			</div>
		</CodeBlockContainer>
	);
}

function CodeBlockElement({ children, className }) {
	return (
		<CodeBlockContainer as="pre" tabIndex={0} className={clsx(styles('CodeBlock/Element').codeBlockStandalone, 'thin-scrollbar', className)}>
			<code className={styles('CodeBlock/Element').codeBlockLines}>{children}</code>
		</CodeBlockContainer>
	);
}

export function CodeBlock({ children, ...props }) {
	if (props.metastring?.split(/\s+/).includes('live') && (typeof children === 'undefined' || typeof children === 'string')) return <Playground {...props}>{children}</Playground>;
	const list = toArray(children);
	const text = list.some((el) => isElement(el)) ? null : Array.isArray(children) ? children.join('') : children;
	if (typeof text === 'string') return <CodeBlockString {...props}>{text}</CodeBlockString>;
	return <CodeBlockElement {...props}>{children}</CodeBlockElement>;
}

export function MDXCode(props) {
	const inline = typeof props.children !== 'undefined' && toArray(props.children).every((el) => typeof el === 'string' && !el.includes('\n'));
	return inline ? <code {...props} /> : <CodeBlock {...props} />;
}

const adIcons = {
	note: { viewBox: '0 0 14 16', d: 'M6.3 5.69a.942.942 0 0 1-.28-.7c0-.28.09-.52.28-.7.19-.18.42-.28.7-.28.28 0 .52.09.7.28.18.19.28.42.28.7 0 .28-.09.52-.28.7a1 1 0 0 1-.7.3c-.28 0-.52-.11-.7-.3zM8 7.99c-.02-.25-.11-.48-.31-.69-.2-.19-.42-.3-.69-.31H6c-.27.02-.48.13-.69.31-.2.2-.3.44-.31.69h1v3c.02.27.11.5.31.69.2.2.42.31.69.31h1c.27 0 .48-.11.69-.31.2-.19.3-.42.31-.69H8V7.98v.01zM7 2.3c-3.14 0-5.7 2.54-5.7 5.68 0 3.14 2.56 5.7 5.7 5.7s5.7-2.55 5.7-5.7c0-3.15-2.56-5.69-5.7-5.69v.01zM7 .98c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.12-7-7 3.14-7 7-7z' },
	tip: { viewBox: '0 0 12 16', d: 'M6.5 0C3.48 0 1 2.19 1 5c0 .92.55 2.25 1 3 1.34 2.25 1.78 2.78 2 4v1h5v-1c.22-1.22.66-1.75 2-4 .45-.75 1-2.08 1-3 0-2.81-2.48-5-5.5-5zm3.64 7.48c-.25.44-.47.8-.67 1.11-.86 1.41-1.25 2.06-1.45 3.23-.02.05-.02.11-.02.17H5c0-.06 0-.13-.02-.17-.2-1.17-.59-1.83-1.45-3.23-.2-.31-.42-.67-.67-1.11C2.44 6.78 2 5.65 2 5c0-2.2 2.02-4 4.5-4 1.22 0 2.36.42 3.22 1.19C10.55 2.94 11 3.94 11 5c0 .66-.44 1.78-.86 2.48zM4 14h5c-.23 1.14-1.3 2-2.5 2s-2.27-.86-2.5-2z' },
	info: { viewBox: '0 0 14 16', d: 'M7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm1 3H6v5h2V4zm0 6H6v2h2v-2z' },
	warning: { viewBox: '0 0 16 16', d: 'M8.893 1.5c-.183-.31-.52-.5-.887-.5s-.703.19-.886.5L.138 13.499a.98.98 0 0 0 0 1.001c.193.31.53.501.886.501h13.964c.367 0 .704-.19.877-.5a1.03 1.03 0 0 0 .01-1.002L8.893 1.5zm.133 11.497H6.987v-2.003h2.039v2.003zm0-3.004H6.987V5.987h2.039v4.006z' },
	danger: { viewBox: '0 0 12 16', d: 'M5.05.31c.81 2.17.41 3.38-.52 4.31C3.55 5.67 1.98 6.45.9 7.98c-1.45 2.05-1.7 6.53 3.53 7.7-2.2-1.16-2.67-4.52-.3-6.61-.61 2.03.53 3.33 1.94 2.86 1.39-.47 2.3.53 2.27 1.67-.02.78-.31 1.44-1.13 1.81 3.42-.59 4.78-3.42 4.78-5.56 0-2.84-2.53-3.22-1.25-5.61-1.52.13-2.03 1.13-1.89 2.75.09 1.08-1.02 1.8-1.86 1.33-.67-.41-.66-1.19-.06-1.78C8.18 5.31 8.68 2.45 5.05.32L5.03.3l.02.01z' },
};
export function AdmonitionIcon({ type, ...props }) {
	return (
		<svg viewBox={adIcons[type].viewBox} {...props}>
			<path fillRule="evenodd" d={adIcons[type].d}></path>
		</svg>
	);
}
const adClasses = { note: 'alert alert--secondary', tip: 'alert alert--success', info: 'alert alert--info', warning: 'alert alert--warning', danger: 'alert alert--danger' };

function AdmonitionLayout({ type, icon, title, children, className, id }) {
	const s = styles('Admonition/Layout');
	return (
		<div className={clsx(ThemeClassNames.common.admonition, ThemeClassNames.common.admonitionType(type), s.admonition, className)} id={id}>
			{title || icon ? (
				<div className={s.admonitionHeading}>
					<span className={s.admonitionIcon}>{icon}</span>
					{title}
				</div>
			) : null}
			{children ? <div className={s.admonitionContent}>{children}</div> : null}
		</div>
	);
}

function MyCustomAdmonition(props) {
	return (
		<div style={{ border: 'solid red', padding: 10 }}>
			<Heading as="h5" style={{ color: 'blue', fontSize: 30 }}>
				{props.title}
			</Heading>
			<div>{props.children}</div>
		</div>
	);
}

export function Admonition(props) {
	if (props.type === 'my-custom-admonition') return <MyCustomAdmonition {...props} />;
	const type = adIcons[props.type] ? props.type : 'info';
	const defaults = {
		icon: <AdmonitionIcon type={type} />,
		title: <Translate id={`theme.admonition.${type}`}>{type}</Translate>,
	};
	return (
		<AdmonitionLayout {...defaults} {...props} type={props.type} className={clsx(adClasses[type], props.className)}>
			{props.children}
		</AdmonitionLayout>
	);
}

// Tabs, in the state they have for a visitor with nothing saved: the default (or first) tab selected.
export function Tabs(props) {
	const s = styles('Tabs');
	// sanitizeTabsChildren
	const children = toArray(props.children).filter((child) => child !== '\n');
	const tabValues = props.values ?? children.filter(Boolean).map(({ props: { value, label, attributes, default: isDefault } }) => ({ value, label, attributes, default: isDefault }));
	// getInitialStateValue
	const selected = props.defaultValue ? props.defaultValue : (tabValues.find((tab) => tab.default) ?? tabValues[0])?.value;
	const panelsOf = (value) => withContext({ tabs: { selectedValue: value, lazy: props.lazy } }, () => render(children));
	// A lazy group renders only the selected panel; lib/site.ts swaps in the markup of the one chosen.
	const panels = props.lazy ? Object.fromEntries(tabValues.map((tab) => [tab.value, toHtml(panelsOf(tab.value))])) : undefined;
	return (
		<div className={clsx(ThemeClassNames.tabs.container, s.tabList)} data-mm-tabs={JSON.stringify({ groupId: props.groupId, queryString: props.queryString, values: tabValues.map((t) => t.value), panels })}>
			<ul role="tablist" aria-orientation="horizontal" className={clsx('tabs', props.className)}>
				{tabValues.map(({ value, label, attributes }) => (
					<li role="tab" tabIndex={selected === value ? 0 : -1} aria-selected={selected === value} {...attributes} className={clsx('tabs__item', s.tabItem, attributes?.className, { 'tabs__item--active': selected === value })}>
						{label ?? value}
					</li>
				))}
			</ul>
			<div className="margin-top--md">{panelsOf(selected)}</div>
		</div>
	);
}
// TabItem reads the selected value of the <Tabs> around it (useTabs), so a component wrapping it works too.
export function TabItem({ children, className, value }) {
	const tabs = useContext().tabs;
	if (!tabs) return <>{children}</>;
	const isSelected = value === tabs.selectedValue;
	if (!isSelected && tabs.lazy) return null;
	return (
		<div role="tabpanel" className={clsx(styles('TabItem').tabItem, className)} hidden={!isSelected}>
			{children}
		</div>
	);
}

// Details once started: the theme's collapsible, closed, with its content in the page.
export function Details({ summary, children, ...props }) {
	const common = styles('docusaurus-theme-common/src/components/Details/styles.module.css');
	const own = styles('Details');
	const summaryElement = isElement(summary) ? summary : <summary>{summary ?? 'Details'}</summary>;
	if (isReactServerMarkup()) {
		const attrs = { className: undefined, ...props, open: props.open, 'data-collapsed': !props.open };
		attrs.className = clsx(common.details, clsx('alert alert--info', own.details, props.className));
		return (
			<details {...attrs}>
				{summaryElement}
				<div>
					<div className={common.collapsibleContent}>{children}</div>
				</div>
			</details>
		);
	}
	return (
		<details {...props} open={props.open} data-collapsed={!props.open} className={clsx(common.details, common.isBrowser, clsx('alert alert--info', own.details, props.className))}>
			{summaryElement}
			<div style={props.open ? 'display: block; overflow: visible; height: auto;' : 'display: none; overflow: hidden; height: 0px;'}>
				<div className={common.collapsibleContent}>{children}</div>
			</div>
		</details>
	);
}
export function MDXDetails(props) {
	const items = toArray(props.children);
	const summary = items.find((item) => isElement(item) && (item.type === 'summary' || item.props?.mdxType === 'summary'));
	return (
		<Details {...props} summary={summary}>
			{items.filter((item) => item !== summary)}
		</Details>
	);
}

export function TOCInline({ toc, minHeadingLevel, maxHeadingLevel }) {
	return (
		<div className={styles('TOCInline').tableOfContentsInline}>
			<TOCItems toc={toc} minHeadingLevel={minHeadingLevel} maxHeadingLevel={maxHeadingLevel} className="table-of-contents" linkClassName={null} />
		</div>
	);
}

export function MDXA(props) {
	return <Link {...props} className={clsx(useAnchorTargetClassName(props.id), props.className)} />;
}
export function MDXUl(props) {
	const className = props.className === undefined ? undefined : clsx(props.className, props.className.includes('contains-task-list') && styles('MDXComponents/Ul').containsTaskList);
	return <ul {...props} className={className} />;
}
export function MDXLi(props) {
	return <li className={clsx(useAnchorTargetClassName(props.id), props.className)} {...props} />;
}
export function MDXImg(props) {
	return <img decoding="async" loading="lazy" {...props} className={clsx(props.className, styles('MDXComponents/Img').img)} />;
}
const heading = (as) => (props) => <Heading as={as} {...props} />;

// @theme/MDXContent: the MDX components apply only inside it (a React page rendering an MDX partial gets plain markup).
export function MDXContent({ children }) {
	return withContext({ mdxComponents: useContext().mdxContentComponents }, () => render(children));
}

export function mdxComponents(extra = {}) {
	return {
		Head,
		details: MDXDetails,
		Details: MDXDetails,
		code: MDXCode,
		a: MDXA,
		pre: (props) => <>{props.children}</>,
		ul: MDXUl,
		li: MDXLi,
		img: MDXImg,
		h1: heading('h1'),
		h2: heading('h2'),
		h3: heading('h3'),
		h4: heading('h4'),
		h5: heading('h5'),
		h6: heading('h6'),
		admonition: Admonition,
		mermaid: (props) => useContext().Mermaid(props),
		Code: MDXCode,
		...extra,
	};
}

export { BrowserOnly, ThemedImage, Fragment, isInternalUrl, Heading };
