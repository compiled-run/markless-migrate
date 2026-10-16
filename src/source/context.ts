import type { Project } from './files.ts';
import { parseModule, type Module } from './js.ts';

export interface Context {
	readonly project: Project;
	readonly module: (file: string) => Promise<Module | undefined>;
	readonly limits: string[];
}

export function createContext(project: Project): Context {
	const cache = new Map<string, Promise<Module | undefined>>();
	const limits: string[] = [];
	const module = (file: string) => {
		let mod = cache.get(file);
		if (!mod) {
			mod = project.read(file).then((text) => {
				if (!text) return undefined;
				try {
					const parsed = parseModule(file, text);
					if (!parsed.ok) limits.push(`${file}: parsed with errors, facts from it may be incomplete`);
					return parsed;
				} catch (error) {
					limits.push(`${file}: could not be parsed (${(error as Error).message})`);
					return undefined;
				}
			});
			cache.set(file, mod);
		}
		return mod;
	};
	return { project, module, limits };
}

export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
