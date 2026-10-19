import { show } from './alpine/show.ts';

// The homepage panels: x-show="currentStep === key" with the x-transition classes x-bind picks by direction.
const ENTER = {
	right: { enter: 'transition ease-out', 'enter-start': 'transform translate-x-64 opacity-0 ', 'enter-end': 'transform translate-x-0 opacity-100' },
	left: { enter: 'transition ease-out', 'enter-start': 'transform -translate-x-64 opacity-0', 'enter-end': 'transform translate-x-0 opacity-100' },
};

export function showStep(panels: readonly (HTMLElement | undefined)[], current: number, direction: string): void {
	panels.forEach((panel, i) => show(panel, i === current, { transition: { classes: ENTER[direction === 'right' ? 'right' : 'left'] } }));
}
