// react-top-loading-bar's complete(): full width, then after waitingTime (1000 ms) it fades over
// transitionTime (300 ms) and resets. Markless 0.4.0 runs no attach= at load (a server-rendered page
// wakes on its first event), so the bar's two timers live in this static script.
(() => {
	const COLOR = 'var(--muted-foreground)';
	const fill = document.querySelector('[data-parity="loading-bar"] > div');
	const glow = fill && fill.firstElementChild;
	if (!fill || !glow) return;
	// The old bar completes once React has rendered the first route, a little after load.
	const start = () => setTimeout(() => {
		fill.style.cssText = `height: 100%; background: ${COLOR}; transition: 300ms ease-out; width: 100%; opacity: 0; color: ${COLOR};`;
		setTimeout(() => {
			fill.style.cssText = `height: 100%; background: ${COLOR}; width: 0%; opacity: 1; color: ${COLOR};`;
			glow.style.cssText = `box-shadow: 0 0 10px ${COLOR}, 0 0 10px ${COLOR}; width: 5%; opacity: 1; position: absolute; height: 100%; transform: rotate(2deg) translate(0px, -2px); left: -5.5%;`;
		}, 300);
	}, 1025);
	if (document.readyState === 'complete') start();
	else addEventListener('load', start, { once: true });
})();
