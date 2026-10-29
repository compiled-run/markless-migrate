import { isReactServerMarkup } from '../../source/h.mjs';

export default function useIsBrowser() {
	return !isReactServerMarkup();
}
