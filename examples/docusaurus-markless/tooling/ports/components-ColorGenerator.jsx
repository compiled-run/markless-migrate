// website/src/components/ColorGenerator in its first state (light mode, the default palette); lib/site.ts runs
// its inputs, reset and mode buttons the way the original does.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { clsx, Link, Translate, siteStyles } from '../theme/core.jsx';
import { Admonition, CodeBlock } from '../theme/content.jsx';
import { website } from '../source/site.mjs';

const Color = createRequire(join(website, 'package.json'))('color');
export const COLOR_SHADES = {
	'--ifm-color-primary': { adjustment: 0, adjustmentInput: '0', displayOrder: 3, codeOrder: 0 },
	'--ifm-color-primary-dark': { adjustment: 0.1, adjustmentInput: '10', displayOrder: 4, codeOrder: 1 },
	'--ifm-color-primary-darker': { adjustment: 0.15, adjustmentInput: '15', displayOrder: 5, codeOrder: 2 },
	'--ifm-color-primary-darkest': { adjustment: 0.3, adjustmentInput: '30', displayOrder: 6, codeOrder: 3 },
	'--ifm-color-primary-light': { adjustment: -0.1, adjustmentInput: '-10', displayOrder: 2, codeOrder: 4 },
	'--ifm-color-primary-lighter': { adjustment: -0.15, adjustmentInput: '-15', displayOrder: 1, codeOrder: 5 },
	'--ifm-color-primary-lightest': { adjustment: -0.3, adjustmentInput: '-30', displayOrder: 0, codeOrder: 6 },
};
const adjusted = (shades, base) => Object.keys(shades).map((shade) => ({ ...shades[shade], variableName: shade, hex: Color(base).darken(shades[shade].adjustment).hex() }));
function wcagContrast(foreground, background) {
	const contrast = Color(foreground).contrast(Color(background));
	return contrast > 7 ? 'AAA 🏅' : contrast > 4.5 ? 'AA 👍' : 'Fail 🔴';
}

export default function ColorGenerator() {
	const styles = siteStyles('src/components/ColorGenerator/styles.module.css');
	const baseColor = '#2e8555';
	const background = '#ffffff';
	const shades = COLOR_SHADES;
	return (
		<div data-mm-color-generator="">
			<Admonition type="tip">
				<p>
					<Translate id="colorGenerator.tip.body" values={{ wcagLink: <Link href="https://www.w3.org/TR/WCAG20/#visual-audio-contrast-contrast"><Translate id="colorGenerator.tip.body.wcagLink.label">WCAG-AA contrast ratio</Translate></Link> }}>
						{"Aim for at least {wcagLink} for the primary color to ensure readability. Use the Docusaurus website itself to preview how your color palette would look like. You can use alternative palettes in dark mode because one color doesn't usually work in both light and dark mode."}
					</Translate>
				</p>
			</Admonition>
			<p>
				<label htmlFor="primary_color">
					<strong className="margin-right--sm">
						<Translate id="colorGenerator.inputs.primary.label">Primary Color:</Translate>
					</strong>
				</label>{' '}
				<input id="primary_color" type="text" className={clsx(styles.input, 'margin-right--sm')} value={baseColor} />
				<input type="color" className={styles.colorInput} value={baseColor} />
				<button type="button" className="clean-btn button button--primary margin-left--md">
					<Translate id="colorGenerator.inputs.modeToggle.label" values={{ colorMode: <Translate id="colorGenerator.inputs.modeToggle.label.colorMode.dark">dark</Translate> }}>
						{'Edit {colorMode} mode'}
					</Translate>
				</button>
				<button type="button" className="clean-btn button button--secondary margin-left--md">
					<Translate id="colorGenerator.inputs.resetButton.label">Reset</Translate>
				</button>
			</p>
			<p>
				<label htmlFor="background_color">
					<strong className="margin-right--sm">
						<Translate id="colorGenerator.inputs.background.label">Background:</Translate>
					</strong>
				</label>
				<input id="background_color" type="color" className={clsx(styles.colorInput, 'margin-right--sm')} value={background} />
			</p>
			<div>
				<table className={styles.colorTable}>
					<thead>
						<tr>
							<th>
								<Translate id="colorGenerator.table.heading1">CSS Variable Name</Translate>
							</th>
							<th>
								<Translate id="colorGenerator.table.heading2">Hex</Translate>
							</th>
							<th>
								<Translate id="colorGenerator.table.heading3">Adjustment</Translate>
							</th>
							<th>
								<Translate id="colorGenerator.table.heading4">Contrast Rating</Translate>
							</th>
						</tr>
					</thead>
					<tbody>
						{adjusted(shades, baseColor)
							.sort((a, b) => a.displayOrder - b.displayOrder)
							.map(({ variableName, adjustmentInput, hex }) => (
								<tr>
									<td>
										<code>{variableName}</code>
									</td>
									<td>
										<span className={styles.color} style={{ backgroundColor: hex }} />
										<code className="margin-left--sm">{hex.toLowerCase()}</code>
									</td>
									<td>{variableName === '--ifm-color-primary' ? 0 : <input aria-label={`${variableName} CSS variable name`} className={styles.input} type="number" value={adjustmentInput} />}</td>
									<td style={{ fontSize: 'medium', backgroundColor: background, color: hex }}>
										<b>{wcagContrast(hex, background)}</b>
									</td>
								</tr>
							))}
					</tbody>
				</table>
			</div>
			<p>
				<Translate id="colorGenerator.text" values={{ cssPath: <code>src/css/custom.css</code> }}>
					{'Replace the variables in {cssPath} with these new variables.'}
				</Translate>
			</p>
			<CodeBlock className="language-css" title="/src/css/custom.css">
				{`:root {
${adjusted(shades, baseColor)
	.sort((a, b) => a.codeOrder - b.codeOrder)
	.map((value) => `  ${value.variableName}: ${value.hex.toLowerCase()};`)
	.join('\n')}
}`}
			</CodeBlock>
		</div>
	);
}
