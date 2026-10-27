import * as nodes from './ns/index.js';
export const parseAll = (text) => Object.values(nodes).map((n) => n.parse(text).kind).join(' ');
