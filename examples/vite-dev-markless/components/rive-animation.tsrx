import type { RiveName } from './rive.ts';

export default function RiveAnimation({
	desktopSrc,
	mobileSrc,
	desktopWidth,
	desktopHeight,
	mobileWidth,
	mobileHeight,
	canvasClass,
}: {
	readonly desktopSrc: RiveName;
	readonly mobileSrc: RiveName;
	readonly desktopWidth: number;
	readonly desktopHeight: number;
	readonly mobileWidth: number;
	readonly mobileHeight: number;
	readonly canvasClass: string;
}) @{
	<div class="touch-none select-none">
		<canvas width={desktopWidth} height={desktopHeight} class={canvasClass} data-rive={`${desktopSrc} ${desktopWidth} ${desktopHeight} ${mobileSrc} ${mobileWidth} ${mobileHeight}`}></canvas>
	</div>
}
