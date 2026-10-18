// The docs plugin's client hooks the site's components call, read from the page context and global data.
export { currentSidebarCategory as useCurrentSidebarCategory, findFirstSidebarItemLink, isActiveSidebarItem } from '../docs.jsx';
import { useContext } from '../core.jsx';
import { activeDocContext } from '../chrome.jsx';

const plugin = (id = 'default') => useContext().globalData['docusaurus-plugin-content-docs'][id ?? 'default'];
export const useDocsSidebar = () => useContext().sidebar;
export const useDocsVersion = () => useContext().version;
export const useActiveDocContext = (id) => activeDocContext(id ?? 'default');
export const useVersions = (id) => plugin(id).versions;
export const useLatestVersion = (id) => plugin(id).versions.find((v) => v.isLast) ?? plugin(id).versions[0];
export const useActiveVersion = (id) => activeDocContext(id ?? 'default').activeVersion;
export const useDocsPreferredVersion = () => ({ preferredVersion: null, savePreferredVersionName() {} });
export const useActivePlugin = () => ({ pluginId: 'default', pluginData: plugin() });
