import './style.css';

const stamp = document.querySelector('[data-rendered-at]');
if (stamp) stamp.textContent = new Date().toISOString();
