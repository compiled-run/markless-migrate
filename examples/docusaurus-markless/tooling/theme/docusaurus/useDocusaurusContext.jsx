import { useContext } from '../core.jsx';
export default function useDocusaurusContext() {
	const { siteConfig, siteMetadata, i18n, globalData, codeTranslations } = useContext();
	return { siteConfig, siteMetadata, i18n, globalData, codeTranslations };
}
