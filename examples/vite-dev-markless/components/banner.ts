export function dismissBanner(): void {
	document.documentElement.classList.add('banner-dismissed');
	localStorage.setItem('banner-dismissed-viteconf-2026', 'true');
}
