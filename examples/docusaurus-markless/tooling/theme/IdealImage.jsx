// @theme/IdealImage (plugin-ideal-image) as it first renders in the browser: the blurred placeholder at the
// image's size. lib/site.ts loads the image when the placeholder scrolls into view, as the plugin's Waypoint does,
// and swaps in the loaded markup; data-mm-ideal carries the image set to it and is taken off at start.
import { domStyle } from './content.jsx';
import { styleString, isReactServerMarkup, serverHtml } from '../source/h.mjs';

const theme = {
	placeholder: { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', position: 'relative' },
	img: { width: '100%', height: 'auto', maxWidth: '100%', marginBottom: '-4px' },
};

export default function IdealImage({ img, alt, className, style, ...rest }) {
	if (typeof img === 'string' || 'default' in img) return <img src={typeof img === 'string' ? img : img.default} alt={alt} className={className} style={style} {...rest} />;
	const width = img.src.width ?? 100;
	const height = img.src.height ?? 100;
	const set = img.src.images.map((image) => ({ src: image.path, width: image.width, height: image.height }));
	const placeholderStyle = styleString({ ...theme.placeholder, backgroundImage: `url("${img.preSrc}")`, ...style });
	const loaded = { alt, width, height, srcSet: set, style: domStyle({ ...theme.placeholder, ...style }), imgStyle: domStyle(theme.img) };
	return (
		<div className={className} style={placeholderStyle} data-mm-ideal={JSON.stringify(loaded)}>
			<svg style={styleString(theme.img)} width={width} height={height}></svg>
			{isReactServerMarkup() && noscript(set, alt, width, height)}
		</div>
	);
}

// The fallback image the library server-renders (and drops once mounted), in React's server markup.
const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function noscript(set, alt, width, height) {
	const images = set.filter((image) => !/\.webp$/.test(image.src));
	const attrs = [['style', styleString({ ...theme.img, position: 'absolute', top: 0, left: 0 })], ['src', images[0].src], ['srcset', images.map((image) => `${image.src} ${image.width}w`).join(',')], ['alt', alt], ['width', width], ['height', height]];
	return serverHtml(`<noscript><img${attrs.filter(([, v]) => v !== undefined && v !== null).map(([n, v]) => ` ${n}="${escapeHtml(v)}"`).join('')} /></noscript>`);
}
