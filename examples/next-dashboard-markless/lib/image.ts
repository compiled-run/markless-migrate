// next/image's widths: the smallest configured size covering 1x and 2x, never wider than the file.
const SIZES = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

const pick = (width: number) => SIZES.find((size) => size >= width) ?? SIZES[SIZES.length - 1]!;

export const variant = (src: string, width: number) => `/_img/w${pick(width)}${src}`;

export function image(src: string, width: number) {
	return { src: variant(src, width * 2), srcset: `${variant(src, width)} 1x, ${variant(src, width * 2)} 2x` };
}

export const IMAGES: readonly [string, number][] = [
	['/hero-desktop.png', 1000],
	['/hero-mobile.png', 560],
	...['amy-burns', 'balazs-orban', 'delba-de-oliveira', 'evil-rabbit', 'lee-robinson', 'michael-novotny'].flatMap((name): [string, number][] => [
		[`/customers/${name}.png`, 28],
		[`/customers/${name}.png`, 32],
	]),
];
