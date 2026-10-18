// @theme/IdealImage (plugin-ideal-image) as it first renders in the browser: the blurred placeholder at the
// image's size. lib/site.ts loads the image when the placeholder scrolls into view, as the plugin's Waypoint does,
// and swaps in the loaded markup; data-mm-ideal carries the image set to it and is taken off at start.
import { domStyle } from './content.jsx';
import { styleString } from '../source/h.mjs';

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
		</div>
	);
}
