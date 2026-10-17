// next/image's resized copies, written once before the build: public/_img/w<width>/<path>.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const SIZES = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const pick = (width) => SIZES.find((size) => size >= width) ?? SIZES.at(-1);
const IMAGES = [['/hero-desktop.png', 1000], ['/hero-mobile.png', 560], ...['amy-burns', 'balazs-orban', 'delba-de-oliveira', 'evil-rabbit', 'lee-robinson', 'michael-novotny'].flatMap((n) => [[`/customers/${n}.png`, 28], [`/customers/${n}.png`, 32]])];
const root = join(import.meta.dirname, '..', 'public');
for (const [src, width] of IMAGES) {
	for (const w of new Set([pick(width), pick(width * 2)])) {
		const out = join(root, `_img/w${w}${src}`);
		await mkdir(dirname(out), { recursive: true });
		await sharp(join(root, src)).resize({ width: w, withoutEnlargement: true }).png({ quality: 75 }).toFile(out);
	}
}
