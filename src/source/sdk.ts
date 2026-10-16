import type { Context } from './context.ts';
import { resolveImport } from './files.ts';
import { functionOf, isFunction, memberName, patternNames, queryText, unwrap, walk, type Module, type N } from './js.ts';

const PACKAGES: [RegExp, string][] = [
	[/^@prisma\/client/, 'prisma'],
	[/^drizzle-orm/, 'drizzle'],
	[/^@supabase\//, 'supabase'],
	[/^stripe$/, 'stripe'],
	[/^@stripe\/stripe-js/, 'stripe'],
	[/^mongoose$/, 'mongoose'],
	[/^mongodb$/, 'mongodb'],
	[/^firebase\/firestore|^firebase-admin/, 'firestore'],
	[/^knex$/, 'knex'],
	[/^kysely/, 'kysely'],
	[/^(pg|postgres|@vercel\/postgres|@neondatabase\/serverless|mysql2(\/promise)?|better-sqlite3|@planetscale\/database|@libsql\/client|@vercel\/sql)$/, 'sql'],
	[/^(@upstash\/redis|ioredis|redis|@vercel\/kv)$/, 'redis'],
	[/^(@sanity\/client|next-sanity)$/, 'sanity'],
	[/^contentful-management$/, 'contentful-management'],
	[/^(@paypal\/|@lemonsqueezy\/|braintree$|@adyen\/|square$|@paddle\/|@polar-sh\/)/, 'payments'],
	[/^@shopify\/(shopify-api|admin-api-client)/, 'shopify-admin'],
	[/^(sequelize|typeorm|@mikro-orm\/)/, 'orm'],
];

const PAYMENTS = new Set(['stripe', 'payments']);

const MUTATION: Record<string, RegExp> = {
	prisma: /\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|\$executeRaw|\$executeRawUnsafe|\$transaction)$/,
	drizzle: /\.(insert|update|delete)(\(\)|$)/,
	supabase: /\.(insert|update|upsert|delete|rpc)(\(\)|$)/,
	mongoose: /\.(insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|findOneAndUpdate|findOneAndDelete|findByIdAndUpdate|findByIdAndDelete|bulkWrite|save|create)$/,
	mongodb: /\.(insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|findOneAndUpdate|findOneAndDelete|bulkWrite)$/,
	firestore: /(^|\.)(setDoc|addDoc|updateDoc|deleteDoc|runTransaction|writeBatch|set|add|update|delete|commit)$/,
	knex: /\.(insert|update|del|delete|merge|upsert)(\(\)|$)/,
	kysely: /\.(insertInto|updateTable|deleteFrom|replaceInto|mergeInto)(\(\)|$)/,
	redis: /\.(set|setex|del|incr|incrby|decr|hset|hdel|lpush|rpush|sadd|srem|zadd|zrem|expire|getdel|json\.set)$/,
	sanity: /\.(create|createOrReplace|createIfNotExists|patch|delete|mutate|transaction)(\(\)|$)/,
	'contentful-management': /\.(create\w*|update|delete|publish|unpublish|archive)$/,
	'shopify-admin': /\.(request|post|put|delete)$/,
	orm: /\.(create|bulkCreate|update|destroy|save|insert|delete|upsert|remove|persist|flush)$/,
	stripe: /\.(create|update|del|cancel|confirm|capture|pay|refund|attach|detach|finalizeInvoice|voidInvoice|markUncollectible|resume|apply)$/,
	payments: /\.(create\w*|update\w*|delete\w*|cancel\w*|capture\w*|refund\w*|charge\w*|void\w*|sale|submitForSettlement)$/,
};
const FACTORY = /^(createClient|createServerClient|createBrowserClient|createPool|createConnection|init|connect|Client|Pool|neon|drizzle|getFirestore|initializeApp|model)$/;
const SQL_WRITE = /^\s*(insert|update|delete|merge|upsert|replace|truncate|alter|drop|create)\b/i;

export const sdkOfPackage = (source: string, table: readonly [RegExp, string][] = PACKAGES) => table.find(([re]) => re.test(source))?.[1];

/** Which database, payment or CMS-write SDK a name refers to, followed through local imports and factories. */
export class Sdks {
	private readonly memo = new Map<string, Promise<string | undefined>>();
	private readonly busy = new Set<string>();
	private readonly ctx: Context;
	private readonly table: readonly [RegExp, string][];
	constructor(ctx: Context, table: readonly [RegExp, string][] = PACKAGES) {
		this.ctx = ctx;
		this.table = table;
	}

	async ofName(mod: Module, name: string, scope?: N, depth = 0): Promise<string | undefined> {
		if (depth > 5) return undefined;
		if (scope) {
			let init: N | undefined;
			walk(scope, (n) => {
				if (n.type === 'VariableDeclarator' && n.init && patternNames(n.id).includes(name)) init = n.init;
			});
			if (init) return this.ofNode(mod, init, depth + 1);
		}
		const key = `${mod.file}#${name}`;
		if (this.busy.has(key)) return undefined;
		let result = this.memo.get(key);
		if (!result) {
			this.busy.add(key);
			result = (async () => {
				const imported = mod.imports.get(name);
				if (imported) {
					const direct = sdkOfPackage(imported.source, this.table);
					if (direct) return direct;
					const file = resolveImport(this.ctx.project, mod.file, imported.source);
					const other = file ? await this.ctx.module(file) : undefined;
					const exported = other?.exports.get(imported.imported);
					return other && exported ? this.ofNode(other, exported, depth + 1) : undefined;
				}
				const bound = mod.bindings.get(name);
				return bound ? this.ofNode(mod, bound, depth + 1) : undefined;
			})().finally(() => this.busy.delete(key));
			this.memo.set(key, result);
		}
		return result;
	}

	/** The SDK a value is an instance of: a constructor or factory call, an alias, or what a factory function returns. */
	async ofNode(mod: Module, node: N, depth: number): Promise<string | undefined> {
		if (depth > 6) return undefined;
		const n = unwrap(node);
		if (!n) return undefined;
		if (n.type === 'Identifier') return this.ofName(mod, n.name, undefined, depth + 1);
		if (n.type === 'LogicalExpression') return (await this.ofNode(mod, n.left, depth + 1)) ?? this.ofNode(mod, n.right, depth + 1);
		if (n.type === 'ConditionalExpression') return (await this.ofNode(mod, n.consequent, depth + 1)) ?? this.ofNode(mod, n.alternate, depth + 1);
		if (n.type === 'NewExpression' || n.type === 'CallExpression') {
			const callee = unwrap(n.callee);
			if (callee?.type === 'Identifier') return this.ofName(mod, callee.name, undefined, depth + 1);
			if (callee?.type === 'MemberExpression' && !callee.computed && FACTORY.test(callee.property.name)) {
				const root = memberName(callee)?.split(/[.(]/)[0];
				return root ? this.ofName(mod, root, undefined, depth + 1) : undefined;
			}
			return undefined;
		}
		if (isFunction(n) || n.type === 'FunctionDeclaration') {
			const returned: N[] = n.body?.type === 'BlockStatement' ? [] : [n.body];
			walk(n.body, (c) => {
				if (c !== n.body && isFunction(c)) return false;
				if (c.type === 'ReturnStatement' && c.argument) returned.push(c.argument);
			});
			for (const r of returned) {
				const sdk = await this.ofNode(mod, r, depth + 1);
				if (sdk) return sdk;
			}
		}
		return undefined;
	}

	/** The SDK a call reaches and whether it mutates, or undefined when it reaches none. */
	async ofCall(mod: Module, call: N, scope: N | undefined): Promise<{ sdk: string; mutates: boolean } | undefined> {
		const name = memberName(call.callee);
		if (!name) return undefined;
		const root = name.split(/[.(]/)[0]!;
		let sdk = await this.ofName(mod, root, scope);
		if (!sdk) {
			const part = name.split(/[.(]/).find((p) => /^(prisma|supabase|stripe|redis|kv|sanityClient)$/.test(p));
			sdk = part === 'kv' ? 'redis' : part === 'sanityClient' ? 'sanity' : part;
		}
		if (!sdk) return undefined;
		if (sdk === 'sql') {
			const text = call.arguments[0] ? queryText(call.arguments[0], mod) : undefined;
			return { sdk, mutates: !!text && SQL_WRITE.test(text) };
		}
		return { sdk, mutates: (MUTATION[sdk] ?? /^$/).test(name) || (sdk === 'firestore' && /^(setDoc|addDoc|updateDoc|deleteDoc)$/.test(name)) };
	}

	async ofTagged(mod: Module, tagged: N): Promise<{ sdk: string; mutates: boolean } | undefined> {
		const tag = memberName(tagged.tag);
		if (!tag) return undefined;
		const sdk = await this.ofName(mod, tag.split('.')[0]!);
		if (sdk !== 'sql' && sdk !== 'drizzle') return undefined;
		const text = queryText(tagged.quasi, mod) ?? '';
		return { sdk: sdk === 'drizzle' ? 'drizzle' : 'sql', mutates: SQL_WRITE.test(text) };
	}
}

export const isPayment = (sdk: string) => PAYMENTS.has(sdk);

interface Reach {
	touches: Set<string>;
	mutations: { mod: Module; node: N; sdk: string }[];
}

/** SDKs a function mutates (or, for payments, calls), directly or through the functions it calls. */
export class Reacher {
	private readonly memo = new Map<N, Promise<Reach>>();
	private readonly busy = new Set<N>();
	private readonly ctx: Context;
	readonly sdks: Sdks;
	constructor(ctx: Context, sdks: Sdks) {
		this.ctx = ctx;
		this.sdks = sdks;
	}

	reach(mod: Module, fn: N, depth = 0): Promise<Reach> {
		if (this.busy.has(fn)) return Promise.resolve({ touches: new Set(), mutations: [] });
		let result = this.memo.get(fn);
		if (result) return result;
		this.busy.add(fn);
		result = this.compute(mod, fn, depth).finally(() => this.busy.delete(fn));
		this.memo.set(fn, result);
		return result;
	}

	private async compute(mod: Module, fn: N, depth: number): Promise<Reach> {
		const out: Reach = { touches: new Set(), mutations: [] };
		const calls: N[] = [];
		const tagged: N[] = [];
		walk(fn.body ?? fn, (n) => {
			if (n.type === 'CallExpression') calls.push(n);
			if (n.type === 'TaggedTemplateExpression') tagged.push(n);
		});
		for (const call of calls) {
			const hit = await this.sdks.ofCall(mod, call, fn);
			if (hit && (hit.mutates || isPayment(hit.sdk))) {
				out.touches.add(hit.sdk);
				out.mutations.push({ mod, node: call, sdk: hit.sdk });
			}
			if (hit || depth >= 4) continue;
			const target = await this.callee(mod, call);
			if (target && target.fn !== fn) {
				const inner = await this.reach(target.mod, target.fn, depth + 1);
				for (const t of inner.touches) out.touches.add(t);
				out.mutations.push(...inner.mutations);
			}
		}
		for (const t of tagged) {
			const hit = await this.sdks.ofTagged(mod, t);
			if (hit?.mutates) {
				out.touches.add(hit.sdk);
				out.mutations.push({ mod, node: t, sdk: hit.sdk });
			}
		}
		return out;
	}

	private async callee(mod: Module, call: N): Promise<{ mod: Module; fn: N } | undefined> {
		const callee = unwrap(call.callee);
		if (callee?.type !== 'Identifier') return undefined;
		const local = functionOf(mod.bindings.get(callee.name), mod);
		if (local) return { mod, fn: local };
		const imported = mod.imports.get(callee.name);
		const file = imported && resolveImport(this.ctx.project, mod.file, imported.source);
		const other = file ? await this.ctx.module(file) : undefined;
		const fn = other ? functionOf(other.exports.get(imported!.imported), other) : undefined;
		return other && fn ? { mod: other, fn } : undefined;
	}
}
