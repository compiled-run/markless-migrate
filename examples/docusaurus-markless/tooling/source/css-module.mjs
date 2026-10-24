// A CSS module import: its class names as the old build hashed them.
import { cssModuleMap } from './stylesheet.mjs';
const file = new URL(import.meta.url).searchParams.get('file');
export default file ? cssModuleMap(file) : {};
