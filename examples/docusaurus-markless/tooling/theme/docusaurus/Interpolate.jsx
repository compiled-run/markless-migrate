export { interpolate } from '../core.jsx';
import { interpolate } from '../core.jsx';
export default function Interpolate({ children, values }) {
	return <>{interpolate(children, values)}</>;
}
