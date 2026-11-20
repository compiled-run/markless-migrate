// What a site-listed switch does on a phone, where the original renders another branch for it (shadcn's SidebarProvider
// under useIsMobile opens a Sheet instead of switching the desktop sidebar): its use at the phone viewport, recorded as
// a reveal tagged with that viewport, so the port opens that layer there and keeps the switch at the other widths.
import type { Browser } from 'playwright';
import { VIEWPORTS } from '../check/types.ts';
import { captureReveals, incompleteCapture, type Reveal } from './reveal.ts';
import type { Switch } from './toggles.ts';

const PHONE_VIEWPORT = VIEWPORTS.find((v) => v.isMobile)!;

/** The phone layers of the recorded switches: each listed control's use at the phone viewport that opened a layer. */
export async function capturePhoneUses(browser: Browser, origin: string, route: string, dir: string, selectors: readonly string[], switches: readonly Switch[], settled?: Readonly<Record<string, string>>): Promise<readonly Reveal[]> {
	if (!switches.length || !selectors.length) return [];
	// The pass's own controls, as a listed opener's: a listed `extra` keeps only what it adds in place.
	const capture = await captureReveals(browser, origin, route, dir, [PHONE_VIEWPORT], [], { controls: selectors.map((s) => [s, 'click'] as const), tag: 'phone:', ...(settled ? { settled } : {}) });
	const incomplete = incompleteCapture(capture);
	if (incomplete) throw new Error(incomplete);
	const recorded = new Set(switches.map((s) => `${s.sig}#${s.nth}`));
	return capture.reveals.filter((r) => r.sig !== undefined && recorded.has(`${r.sig}#${r.nth ?? 0}`) && r.added.some((a) => a.into === 'body'));
}
