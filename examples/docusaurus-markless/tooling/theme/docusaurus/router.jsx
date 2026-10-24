import { useContext } from '../core.jsx';
export function useLocation() {
	return { pathname: useContext().path, search: '', hash: '' };
}
export function useHistory() {
	return { location: useLocation(), push() {}, replace() {} };
}
