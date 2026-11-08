// The behaviours the old app's source holds, read from its syntax trees: its handlers, the animation library components and calls it uses, its scroll hooks and listeners, the :hover and :focus rules of its stylesheets and its media elements, each keyed the way a live page shows it.
import type { BehaviourKind, SourceBehaviour } from '../check/inventory-compare.ts';
import { parseRules } from '../check/stylesheet.ts';
import { handlerSites } from '../ledger/source.ts';
import { isConfigFile, isScript, isTestFile, openProject, type Project } from './files.ts';
import { memberName, parseModule, walk, type N } from './js.ts';

const ANIMATION_PACKAGES = /^(framer-motion|motion|motion\/react|motion\/react-client|@react-spring\/web|react-spring|gsap|@gsap\/react|aos|animejs|@formkit\/auto-animate)$/;
const ANIMATION_CALLS = /^(animate|useAnimate|useAnimation|useAnimationControls|useSpring|useTransition|useSprings|useTrail|gsap\.(to|from|fromTo|timeline|set)|anime|AOS\.init|autoAnimate)$/;
const SCROLL_CALLS = /^(useScroll|useInView|useScrollTrigger|useWindowScroll|useIntersectionObserver|useInViewport|useScrollPosition|useMotionValueEvent|ScrollTrigger\.create)$/;
const SCROLL_PROPS = new Set(['onScroll', 'onWheel', 'whileInView', 'onViewportEnter', 'onViewportLeave']);
const MEDIA = new Set(['img', 'video', 'audio', 'source', 'picture']);

const jsxName = (n: N | undefined): string | undefined => (!n ? undefined : n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${jsxName(n.object)}.${n.property.name}` : undefined);
const literal = (a: N | undefined): string | undefined => (a?.type === 'JSXAttribute' && a.value?.type === 'Literal' && typeof a.value.value === 'string' ? a.value.value : a?.type === 'JSXAttribute' && a.value?.type === 'JSXExpressionContainer' && a.value.expression?.type === 'Literal' && typeof a.value.expression.value === 'string' ? a.value.expression.value : undefined);
const attr = (el: N, name: string): N | undefined => (el.openingElement.attributes as N[]).find((a) => a.type === 'JSXAttribute' && jsxName(a.name) === name);

/** The element's text when every part of it is written out in the source; undefined when any part is computed. */
function staticText(el: N): string | undefined {
	let text = '';
	let computed = false;
	walk(el, (n) => {
		if (n.type === 'JSXText') text += n.value;
		else if (n.type === 'JSXExpressionContainer' && n.expression?.type !== 'JSXEmptyExpression') {
			if (n.expression?.type === 'Literal' && typeof n.expression.value === 'string') text += n.expression.value;
			else if (!(n.expression?.type === 'JSXElement' || n.expression?.type === 'JSXFragment')) computed = true;
			return false;
		} else if (n.type === 'JSXAttribute') return false;
	});
	return computed ? undefined : text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
}

const item = (kind: BehaviourKind, what: string, file: string, line: number, key?: string): SourceBehaviour => ({ kind, what, file, line, ...(key ? { key } : {}) });

async function scriptBehaviours(project: Project, file: string): Promise<SourceBehaviour[]> {
	const mod = parseModule(file, await project.read(file));
	if (!mod.ok) return [];
	const out: SourceBehaviour[] = [];
	const fromAnimation = (local: string) => ANIMATION_PACKAGES.test(mod.imports.get(local)?.source ?? '');
	walk(mod.program, (n, ancestors) => {
		const line = mod.line(n.start);
		if (n.type === 'JSXElement') {
			const name = jsxName(n.openingElement.name);
			if (!name) return;
			const [root, part] = name.split('.');
			if (part && fromAnimation(root!)) {
				const text = staticText(n);
				out.push(item('animation', `<${name}>`, file, line, text !== undefined ? `animation|${part}|${text || `<${part}>`}` : undefined));
			} else if (!part && fromAnimation(name)) out.push(item('animation', `<${name}>`, file, line));
			for (const a of n.openingElement.attributes as N[]) {
				const prop = a.type === 'JSXAttribute' ? jsxName(a.name) : undefined;
				if (prop && SCROLL_PROPS.has(prop)) out.push(item('scroll', `${prop} on <${name}>`, file, line));
			}
			const imported = mod.imports.get(name);
			const tag = MEDIA.has(name) ? name : imported?.source === 'next/image' ? 'img' : undefined;
			if (tag) {
				const src = literal(attr(n, 'src'));
				const holder = ancestors.findLast((x) => x.type === 'JSXElement');
				const shown = tag === 'source' ? (jsxName(holder?.openingElement.name) ?? 'source') : tag;
				if (tag !== 'picture') out.push(item('media', `<${name}>${src ? ` ${src}` : ''}`, file, line, src?.startsWith('/') ? `media|${shown}|${src.split(/[?#]/)[0]}` : undefined));
			}
		} else if (n.type === 'CallExpression' || n.type === 'NewExpression') {
			const callee = memberName(n.callee);
			if (!callee) return;
			if (n.type === 'NewExpression' && callee === 'IntersectionObserver') out.push(item('scroll', 'new IntersectionObserver', file, line));
			else if (SCROLL_CALLS.test(callee)) out.push(item('scroll', `${callee}()`, file, line));
			else if (/\.addEventListener$/.test(callee) && n.arguments[0]?.type === 'Literal' && /^(scroll|wheel)$/.test(n.arguments[0].value)) out.push(item('scroll', `${callee}('${n.arguments[0].value}')`, file, line));
			else if (ANIMATION_CALLS.test(callee) && (fromAnimation(callee.split('.')[0]!) || callee.startsWith('gsap.') || callee.startsWith('AOS.'))) out.push(item('animation', `${callee}()`, file, line));
		}
	});
	return out;
}

/** Every behaviour the source holds, in file order. */
export async function scanBehaviours(root: string): Promise<SourceBehaviour[]> {
	const project = await openProject(root);
	const out: SourceBehaviour[] = [];
	for (const site of await handlerSites(root)) {
		if (site.kind !== 'app') continue;
		const text = site.anchors.find((a) => a.anchor === 'self')?.text;
		const named = text?.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
		out.push(item('handler', `${site.props.join(', ')} on <${site.element}>${named ? ` "${named}"` : ''}`, site.file, site.line, named ? `handler|${named}` : undefined));
	}
	for (const file of project.files) {
		if (isTestFile(file) || isConfigFile(file)) continue;
		if (/\.(m?[jt]sx?)$/.test(file) && isScript(file)) out.push(...(await scriptBehaviours(project, file).catch(() => [])));
		else if (/\.css$/.test(file)) {
			// A CSS module's class names are renamed by its build, so its rules are found live by their kind alone.
			const module = /\.module\.css$/.test(file);
			for (const rule of parseRules([{ url: file, text: await project.read(file) }])) {
				const kind = /:hover\b/.test(rule.selector) ? 'hover-rule' : /:focus(-visible|-within)?\b/.test(rule.selector) ? 'focus-rule' : undefined;
				if (kind) out.push(item(kind, rule.selector.slice(0, 120), file, rule.line, module ? undefined : `css|${normalSelector(rule.selector)}`));
			}
		}
	}
	return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** A selector as the live page's is compared: no space around a combinator, one space elsewhere. */
export function normalSelector(s: string): string {
	return s.replace(/\s*([>+~])\s*/g, '$1').replace(/\s+/g, ' ').trim();
}
