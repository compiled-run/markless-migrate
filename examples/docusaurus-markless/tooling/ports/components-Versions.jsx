// website/src/components/Versions: rendered as before the npm registry answers; lib/site.ts fetches the latest
// canary version from the registry as the original does and fills it in.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Link, Translate } from '../theme/core.jsx';
import { CodeBlock } from '../theme/content.jsx';
import { website } from '../source/site.mjs';
import { useVersions } from '../theme/docusaurus/plugin-content-docs-client.jsx';

const versions = JSON.parse(readFileSync(join(website, 'versions.json'), 'utf8'));
export const CurrentMajorVersionNumber = parseInt(versions[0].split('.')[0], 10);

export function VersionsProvider({ children }) {
	return <>{children}</>;
}
function useStableVersion() {
	const all = useVersions('default');
	return (all.find((v) => v.name !== 'current') ?? all[0]).name;
}
export function CanaryVersion() {
	return (
		<span data-mm-canary="version">
			<Translate>Example: 0.0.0-4922</Translate>
		</span>
	);
}
export function StableVersion() {
	return <span>{useStableVersion()}</span>;
}
export function StableMajorBranchLink() {
	return <code>{`docusaurus-v${CurrentMajorVersionNumber}`}</code>;
}
export function MainBranchLink() {
	return (
		<Link to="https://github.com/facebook/docusaurus/tree/main">
			<code>main</code>
		</Link>
	);
}
export function InsertIfCanaryVersionUnknown({ children }) {
	return <>{children}</>;
}
export function InsertIfCanaryVersionKnown() {
	return null;
}
export function PackageJSONDiff() {
	const stable = useStableVersion();
	return (
		<CodeBlock language="diff">
			{`-  "@docusaurus/core": "^${stable}",
-  "@docusaurus/preset-classic": "^${stable}",
+  "@docusaurus/core": "0.0.0-4922",
+  "@docusaurus/preset-classic": "0.0.0-4922",
`}
		</CodeBlock>
	);
}
export function PublishTime() {
	return null;
}
