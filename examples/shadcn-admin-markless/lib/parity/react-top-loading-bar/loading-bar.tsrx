// Parity port of react-top-loading-bar as the old app drives it (NavigationProgress calls complete() once
// the first route has loaded). Markless renders the page complete, so the bar starts at complete();
// public/parity/loading-bar.js fades and resets it on the library's timers.
export function LoadingBar() @{
	<div class="" data-parity="loading-bar" style="position: fixed; top: 0px; left: 0px; height: 2px; background: transparent; z-index: 2147483647; width: 100%;"><div class="" style="height: 100%; background: var(--muted-foreground); transition: 500ms; width: 100%; opacity: 1;"><div style="box-shadow: 0 0 10px var(--muted-foreground), 0 0 10px var(--muted-foreground); width: 5%; opacity: 1; position: absolute; height: 100%; transition: 500ms; transform: rotate(2deg) translate(0px, -2px); left: 90%;"></div></div></div>
}
