// website/src/components/UpgradeGuide, as it renders on this site (the current docs version is "Canary").
import { Link, Translate } from '../theme/core.jsx';
import { Admonition, CodeBlock } from '../theme/content.jsx';
import { useLatestVersion, useVersions, useActiveDocContext } from '../theme/docusaurus/plugin-content-docs-client.jsx';

function PackageJson() {
	const latest = useLatestVersion();
	const all = useVersions();
	const name = latest.name === 'current' && all.length > 1 ? all[1].name : latest.name;
	return (
		<CodeBlock language="json" title="package.json">{`{
  "dependencies": {
    "@docusaurus/core": "${name}",
    "@docusaurus/preset-classic": "${name}",
    // ...
  }
}`}</CodeBlock>
	);
}

function VersionNotice() {
	const latest = useLatestVersion();
	const active = useActiveDocContext().activeVersion;
	if (active.name === 'current') {
		return (
			<Admonition type="info">
				<p>
					<Translate
						id="upgradeGuide.unreleasedVersion.notice"
						values={{
							canaryDocLink: (
								<Link href="/community/canary">
									<Translate id="upgradeGuide.unreleasedVersion.notice.canaryDocLink.label" values={{ canaryTag: <code>@canary</code> }}>
										{'{canaryTag} release'}
									</Translate>
								</Link>
							),
						}}>
						{'You are browsing the documentation of an unreleased version. If you want to use any unreleased feature, you can use the {canaryDocLink}.'}
					</Translate>
				</p>
			</Admonition>
		);
	}
	if (active.name !== latest.name) {
		return (
			<Admonition type="warning">
				<p>
					<Translate id="upgradeGuide.outdatedVersion.notice">You are browsing the documentation of an outdated version. The snippet below shows how to upgrade to the latest version.</Translate>
				</p>
			</Admonition>
		);
	}
	return null;
}

export default function UpgradeGuide() {
	return (
		<>
			<VersionNotice />
			<PackageJson />
		</>
	);
}
