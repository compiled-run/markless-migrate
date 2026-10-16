export const DIMENSIONS = ['http', 'rendered', 'visual', 'seo', 'assets', 'css', 'weight'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface Viewport {
	readonly name: string;
	readonly width: number;
	readonly height: number;
	readonly isMobile: boolean;
}

export const VIEWPORTS: readonly Viewport[] = [
	{ name: 'desktop', width: 1280, height: 800, isMobile: false },
	{ name: 'mobile', width: 390, height: 844, isMobile: true },
];

export interface HttpHop {
	readonly url: string;
	readonly status: number;
}

export interface HttpCapture {
	readonly chain: readonly HttpHop[];
	readonly status: number;
	readonly contentType: string;
}

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface ElementSnapshot {
	readonly id: number;
	readonly role: string;
	readonly name: string;
	readonly tag: string;
	readonly text: string;
	readonly path: string;
	readonly box: Box;
	readonly style: Readonly<Record<string, string>>;
	/** The font files that render this element's own text: web fonts by content hash, system fonts by name. */
	readonly font?: string;
}

export interface AssetRecord {
	readonly url: string;
	readonly type: string;
	readonly status: number;
	readonly contentType: string;
	readonly bytes: number;
	readonly fingerprinted: boolean;
}

export interface ImageRecord {
	readonly src: string;
	readonly alt: string | null;
	readonly naturalWidth: number;
	readonly naturalHeight: number;
	readonly broken: boolean;
}

export interface ScriptWeight {
	readonly url: string;
	readonly bytes: number;
	readonly source: number;
	readonly executed: number;
}

/** downloaded: bytes on the wire (compressed when the server compresses); source and executed: uncompressed source bytes. */
export interface Weight {
	readonly downloaded: number;
	readonly source: number;
	readonly executed: number;
	readonly scripts: readonly ScriptWeight[];
}

export interface PageCapture {
	readonly viewport: string;
	readonly finalUrl: string;
	readonly aria: readonly string[];
	readonly text: readonly string[];
	readonly seo: Readonly<Record<string, string>>;
	readonly assets: readonly AssetRecord[];
	readonly stylesheets: readonly { readonly url: string; readonly text: string }[];
	readonly decoded: Readonly<Record<string, { width: number; height: number }>>;
	readonly images: readonly ImageRecord[];
	readonly fonts: readonly string[];
	readonly elements: readonly ElementSnapshot[];
	readonly screenshot: Buffer;
	readonly weight: Weight;
}

export interface RouteCapture {
	readonly origin: string;
	readonly route: string;
	readonly http: HttpCapture;
	readonly pages: Readonly<Record<string, PageCapture>>;
}

export interface Failure {
	readonly route: string;
	readonly dimension: Dimension;
	readonly check: string;
	readonly viewport?: string;
	readonly expected: string;
	readonly actual: string;
	readonly hint: string;
}

/** A pair of screenshots of one route in one viewport and state, with the boxes where they differ. */
export interface Shot {
	readonly label: string;
	readonly viewport: string;
	readonly old: Buffer;
	readonly new: Buffer;
	readonly diff?: Buffer;
	readonly regions: readonly Box[];
	readonly ok: boolean;
}

export interface RouteResult {
	readonly route: string;
	readonly ok: boolean;
	readonly dimensions: Readonly<Record<Dimension, 'pass' | 'fail'>>;
	readonly failures: readonly Failure[];
	readonly weight: { readonly old: Omit<Weight, 'scripts'>; readonly new: Omit<Weight, 'scripts'> };
	readonly visualDiffs: readonly { viewport: string; png: Buffer }[];
	readonly shots: readonly Shot[];
}

export interface Report {
	readonly version: 1;
	readonly old: string;
	readonly new: string;
	readonly startedAt: string;
	readonly ok: boolean;
	readonly routes: readonly RouteResult[];
}
