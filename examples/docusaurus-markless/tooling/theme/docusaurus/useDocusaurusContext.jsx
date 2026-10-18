import { useContext } from '../core.jsx';
export default function useDocusaurusContext() {
	const { siteConfig, i18n, globalData, codeTranslations } = useContext();
	return { siteConfig, i18n, globalData, codeTranslations, siteMetadata: {} };
}
