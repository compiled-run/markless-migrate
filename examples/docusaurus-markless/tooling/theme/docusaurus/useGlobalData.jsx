import { useContext } from '../core.jsx';
export default function useGlobalData() {
	return useContext().globalData;
}
export function usePluginData(name, id = 'default') {
	return useContext().globalData[name]?.[id];
}
