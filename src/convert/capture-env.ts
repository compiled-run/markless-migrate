import { defaultEnv, type SideEnv } from '../check/browser.ts';

/** What every convert capture of the old site runs as: a visitor who allows motion, so what the port is written from is the page as most visitors see it; a reduced-motion capture is a variant recorded beside it, never the port's source. */
export const CAPTURE_MOTION = 'no-preference' as const;

export function captureEnv(origin: string, over: Partial<SideEnv> = {}): SideEnv {
	return defaultEnv(origin, { reducedMotion: CAPTURE_MOTION, ...over });
}
