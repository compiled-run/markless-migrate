// @docusaurus/theme-common, as the site's own modules use it: hooks read the page state a first visit has
// (light colour mode, no query string, nothing stored).
export { ThemeClassNames } from '../core.jsx';
export { Details } from '../content.jsx';
import { useContext } from '../core.jsx';
export { PageMetadata } from '../chrome.jsx';

export const useColorMode = () => ({ colorMode: 'light', colorModeChoice: null, setColorMode() {} });
export const useThemeConfig = () => useContext().siteConfig.themeConfig;
export function usePluralForm() {
	return {
		selectMessage: (count, messages) => {
			const [one, other] = messages.split('|');
			return count === 1 ? one : (other ?? one);
		},
	};
}
export const useQueryString = () => [null, () => {}];
export const useQueryStringList = () => [[], () => {}];
export const useQueryStringValue = () => null;
export const useClearQueryString = () => () => {};
export const useWindowSize = () => 'desktop';
export const usePrevious = (value) => value;
export function createStorageSlot(key) {
	return { get: () => null, set() {}, del() {}, listen: () => () => {}, key };
}
export function HtmlClassNameProvider({ className, children }) {
	useContext().htmlClasses?.push(className);
	return children;
}
export const ErrorCauseBoundary = ({ children }) => children;
