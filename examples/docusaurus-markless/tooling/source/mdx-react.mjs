// MDX's provider: the components the page renders MDX with (the theme's MDXComponents and the site's additions).
import { useContext } from './h.mjs';
export function useMDXComponents() {
	return useContext().mdxComponents ?? {};
}
export function MDXProvider({ children }) {
	return children;
}
