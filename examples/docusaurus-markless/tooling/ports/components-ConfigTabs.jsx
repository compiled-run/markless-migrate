// website/src/components/ConfigTabs.
import { Link, Translate, translate } from '../theme/core.jsx';
import { Tabs, TabItem, CodeBlock } from '../theme/content.jsx';
import { useActiveVersion } from '../theme/docusaurus/plugin-content-docs-client.jsx';

export default function ConfigTabs({ code, pluginName, presetOptionName }) {
	const versionPath = useActiveVersion().path;
	return (
		<Tabs groupId="api-config-ex">
			<TabItem value="preset" label={translate({ message: 'Preset options' })}>
				<p>
					<Translate id="apiDocs.configTabs.presetOptions.description" values={{ presetLink: <Link to={`${versionPath}/using-plugins#docusauruspreset-classic`}><Translate>preset options</Translate></Link> }}>
						{'If you use a preset, configure this plugin through the {presetLink}:'}
					</Translate>
				</p>
				<CodeBlock language="js" title="docusaurus.config.js">
					{`module.exports = {
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        // highlight-start
        ${presetOptionName}: ${code.replace(/\n/g, '\n        ')},
        // highlight-end
      },
    ],
  ],
};`}
				</CodeBlock>
			</TabItem>
			<TabItem value="plugin" label={translate({ message: 'Plugin options' })}>
				<p>
					<Translate>If you are using a standalone plugin, provide options directly to the plugin:</Translate>
				</p>
				<CodeBlock language="js" title="docusaurus.config.js">
					{`module.exports = {
  plugins: [
    [
      '${pluginName}',
      // highlight-start
      ${code.replace(/\n/g, '\n      ')},
      // highlight-end
    ],
  ],
};`}
				</CodeBlock>
			</TabItem>
		</Tabs>
	);
}
