// theme-live-codeblock's Playground: the editor as react-live renders it, the code compiled as react-live compiles
// it (sucrase), and a preview the browser draws (lib/playground.ts).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { clsx, styles, Translate, themeConfig } from './core.jsx';
import { domStyle, themeToDict, tokenStyle, tokenize } from './content.jsx';
import { website } from '../source/site.mjs';

const { transform } = createRequire(join(website, '../node_modules/.pnpm/sucrase@3.35.1/node_modules/sucrase/package.json'))('sucrase');
const sheet = (part) => styles(`docusaurus-theme-live-codeblock/src/theme/Playground/${part}/styles.module.css`);
const sucrase = (transforms) => (code) => transform(code, { transforms, production: true }).code;
const trimCode = (code) => code.trim().replace(/;$/, '');

// react-live's generateElement (inline) and renderElementAsync (noInline), up to the eval.
export function compileLive(code, noInline) {
	const input = `${code};`;
	if (noInline) return sucrase(['jsx', 'typescript', 'imports'])(input);
	return sucrase(['imports'])(trimCode(sucrase(['jsx', 'typescript'])(`return (${trimCode(input)})`)));
}

function PlaygroundHeader({ children, buttons }) {
	const s = sheet('Header');
	return (
		<div className={clsx(s.playgroundHeader)}>
			<div className={s.playgroundHeaderContent}>{children}</div>
			{buttons && <div className={s.playgroundHeaderButtons}>{buttons}</div>}
		</div>
	);
}

function ResetButton({ className }) {
	const s = sheet('Buttons/ResetButton');
	return (
		<button type="button" aria-label="Reset code to original" title="Reset" className={clsx('clean-btn', className, s.resetButton)}>
			<svg className={s.resetButtonIcon} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
				<path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
			</svg>
			<Translate id="theme.Playground.buttons.reset">Reset</Translate>
		</button>
	);
}

function LiveEditor({ code, language }) {
	const theme = themeConfig().prism.theme;
	const dict = themeToDict(theme, language);
	const lines = tokenize(code, language);
	const style = domStyle({ margin: '0px', outline: 'none', padding: '10px', fontFamily: 'inherit', ...theme.plain, ...dict.root, tabSize: '2', whiteSpace: 'pre-wrap' });
	return (
		<div className={sheet('Editor').playgroundEditor}>
			<pre className={`prism-code language-${language}`} spellcheck="false" style={style} contenteditable="plaintext-only">
				{lines.map((line) => (
					<span className="token-line" style={domStyle(dict.plain)}>
						{line.filter((token) => !token.empty).map((token) => (
							<span className={clsx('token', ...token.types)} style={domStyle(tokenStyle(dict, token))}>
								{token.content}
							</span>
						))}
						{'\n'}
					</span>
				))}
			</pre>
		</div>
	);
}

function PlaygroundEditor({ code, language }) {
	return (
		<>
			<PlaygroundHeader buttons={<ResetButton />}>
				<Translate id="theme.Playground.liveEditor">Live Editor</Translate>
			</PlaygroundHeader>
			<LiveEditor code={code} language={language} />
		</>
	);
}

function PlaygroundPreview() {
	return (
		<>
			<PlaygroundHeader>
				<Translate id="theme.Playground.result">Result</Translate>
			</PlaygroundHeader>
			<div className={sheet('Preview').playgroundPreview}>
				<div>Loading...</div>
			</div>
		</>
	);
}

export default function Playground({ children, position, metastring, language = 'tsx' }) {
	const code = (Array.isArray(children) ? children.join('') : (children ?? '')).replace(/\n$/, '');
	const noInline = metastring?.includes('noInline') ?? false;
	const where = position ?? themeConfig().liveCodeBlock?.playgroundPosition;
	const editor = <PlaygroundEditor code={code} language={language} />;
	return (
		<div className={sheet('Container').playgroundContainer} data-mm-live={JSON.stringify({ code, compiled: compileLive(code, noInline), noInline, language })}>
			{where === 'top' ? (
				<>
					<PlaygroundPreview />
					{editor}
				</>
			) : (
				<>
					{editor}
					<PlaygroundPreview />
				</>
			)}
		</div>
	);
}
