// What MDX content and ported components may call on React: rendering happens once, so state is its initial value.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { website } from './site.mjs';
import { h, Fragment, isElement, toArray, useContext as pageContext } from './h.mjs';
export { Fragment };
export const createElement = h;
export const isValidElement = isElement;
export function useState(initial) {
	return [typeof initial === 'function' ? initial() : initial, () => {}];
}
export const useReducer = (reducer, initial, init) => [init ? init(initial) : initial, () => {}];
export const useRef = (initial) => ({ current: initial });
export const useMemo = (fn) => fn();
export const useCallback = (fn) => fn;
export const useEffect = () => {};
export const useLayoutEffect = () => {};
export const useId = (() => {
	let n = 0;
	return () => `:r${(n++).toString(32)}:`;
})();
export function createContext(value) {
	const context = { value, Provider: ({ value: next, children }) => { context.value = next; return children; } };
	return context;
}
export const useContext = (context) => context?.value;
export const memo = (component) => component;
export const forwardRef = (render) => (props) => render(props, null);
export const lazy = () => () => null;
export const Suspense = ({ children }) => children;
export const StrictMode = ({ children }) => children;
export const cloneElement = (element, props, ...children) => ({ ...element, props: { ...element.props, ...props, ...(children.length ? { children } : {}) } });
export const Children = {
	toArray,
	map: (children, fn) => toArray(children).map(fn),
	forEach: (children, fn) => toArray(children).forEach(fn),
	count: (children) => toArray(children).length,
	only: (children) => toArray(children)[0],
};
export const version = JSON.parse(readFileSync(join(website, '../node_modules/react/package.json'), 'utf8')).version;
void pageContext;
const React = { createElement, Fragment, isValidElement, useState, useReducer, useRef, useMemo, useCallback, useEffect, useLayoutEffect, useId, createContext, useContext, memo, forwardRef, lazy, Suspense, StrictMode, cloneElement, Children, version };
export default React;
