import './style.css';

const stamp = document.querySelector('[data-rendered-at]');
if (stamp) stamp.textContent = new Date().toISOString();

const TIPS = ['Pack a spare pair of socks.', 'Check the tide times before you set out.', 'Keep to the path near the cliff edge.', 'Bring cash for the café.'];
const tip = document.querySelector('[data-tip]');
if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]!;

const hours = document.querySelector<HTMLElement>('[data-hours]');
const cms = hours?.parentElement?.dataset.cms;
async function loadHours(): Promise<void> {
	try {
		const response = await fetch(`${cms}/walks/hours`);
		const data = (await response.json()) as { today: string };
		if (hours) hours.textContent = data.today;
	} catch {
		if (hours) hours.textContent = 'unavailable';
	}
}
if (cms && cms !== '{{cms}}') void loadHours();

const count = document.querySelector('.counter output');
document.querySelector('[data-book]')?.addEventListener('click', () => {
	if (count) count.textContent = String(Number(count.textContent) + 1);
});

const menuButton = document.querySelector<HTMLButtonElement>('.menu-button');
const menu = document.getElementById('more-menu');
menuButton?.addEventListener('click', () => {
	const open = menuButton.getAttribute('aria-expanded') !== 'true';
	menuButton.setAttribute('aria-expanded', String(open));
	menu?.toggleAttribute('hidden', !open);
});
menu?.parentElement?.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
		menuButton.setAttribute('aria-expanded', 'false');
		menu.setAttribute('hidden', '');
		menuButton.focus();
	}
});

if (new URLSearchParams(location.search).has('subscribed')) document.querySelector('[data-subscribed]')?.removeAttribute('hidden');
