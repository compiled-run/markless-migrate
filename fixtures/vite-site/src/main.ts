import './style.css';

const stamp = document.querySelector('[data-rendered-at]');
if (stamp) stamp.textContent = new Date().toISOString();

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
