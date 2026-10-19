// The blog templates, ported from theme-classic and plugin-content-blog's client, and the site's changelog
// theme (website/src/plugins/changelog/theme), which reuses them: post pages, lists, tags, authors, the archive.
import { join } from 'node:path';
import { clsx, useContext, styles, siteStyles, ThemeClassNames, translate, Translate, Link, withBaseUrl, samePath, themeConfig, Head, Heading } from './core.jsx';
import { Layout, PageMetadata, SearchMetadata } from './chrome.jsx';
import { TOC, PaginatorNavLink, EditMetaRow, TagsListInline, Tag, ContentVisibility, Unlisted, TagsListByLetter } from './docs.jsx';
import { MDXContent } from './content.jsx';

const plural = (count, message) => {
	const [one, other] = message.split('|');
	return count === 1 ? one : other;
};
const postsPlural = (count) => plural(count, translate({ id: 'theme.blog.post.plurals', message: 'One post|{count} posts' }, { count }));
export const blogTagsPostsPageTitle = (tag) => translate({ id: 'theme.blog.tagTitle', message: '{nPosts} tagged with "{tagName}"' }, { nPosts: postsPlural(tag.count), tagName: tag.label });
export const blogAuthorPageTitle = (author) => translate({ id: 'theme.blog.author.pageTitle', message: '{authorName} - {nPosts}' }, { nPosts: postsPlural(author.count), authorName: author.name || author.key });
const absoluteUrl = (permalink) => {
	const { siteConfig } = useContext();
	const url = `${siteConfig.url}${permalink}`;
	return siteConfig.trailingSlash === false && url.endsWith('/') && permalink !== '/' ? url.slice(0, -1) : url;
};

// The blog post being rendered (BlogPostProvider).
const post = () => useContext().blogPost;

function BlogSidebar({ sidebar }) {
	if (!sidebar?.items.length) return null;
	const s = styles('BlogSidebar/Desktop');
	const path = useContext().path;
	const items = sidebar.items.filter((item) => !item.unlisted || samePath(item.permalink, path));
	const list = (entries) => (
		<ul className={clsx(s.sidebarItemList, 'clean-list')}>
			{entries.map((item) => (
				<li className={s.sidebarItem}>
					<Link isNavLink to={item.permalink} className={s.sidebarItemLink} activeClassName={s.sidebarItemLinkActive} exact>
						{item.title}
					</Link>
				</li>
			))}
		</ul>
	);
	const content = (() => {
		if (!themeConfig().blog?.sidebar?.groupByYear) return list(items);
		const groups = new Map();
		for (const item of items) {
			const year = `${new Date(item.date).getFullYear()}`;
			groups.set(year, [...(groups.get(year) ?? []), item]);
		}
		return [...groups].map(([year, entries]) => (
			<div role="group">
				<Heading as="h3" className={s.yearGroupHeading}>
					{year}
				</Heading>
				{list(entries)}
			</div>
		));
	})();
	return (
		<aside className="col col--3">
			<nav className={clsx(s.sidebar, 'thin-scrollbar')} aria-label={translate({ id: 'theme.blog.sidebar.navAriaLabel', message: 'Blog recent posts navigation' })}>
				<div className={clsx(s.sidebarItemTitle, 'margin-bottom--md')}>{sidebar.title}</div>
				{content}
			</nav>
		</aside>
	);
}

export function BlogLayout({ sidebar, toc, children, ...layoutProps }) {
	const hasSidebar = sidebar && sidebar.items.length > 0;
	return (
		<Layout {...layoutProps}>
			<div className="container margin-vert--lg">
				<div className="row">
					<BlogSidebar sidebar={sidebar} />
					<main className={clsx('col', { 'col--7': hasSidebar, 'col--9 col--offset-1': !hasSidebar })}>{children}</main>
					{toc && <div className="col col--2">{toc}</div>}
				</div>
			</div>
		</Layout>
	);
}

const socialIcons = {
	default: ['default', { xmlns: 'http://www.w3.org/2000/svg', width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', paths: [{ stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' }, { d: 'M1.2 12a10.8 10.8 0 1 0 21.6 0a10.8 10.8 0 0 0 -21.6 0' }, { d: 'M1.92 8.4h20.16' }, { d: 'M1.92 15.6h20.16' }, { d: 'M11.4 1.2a20.4 20.4 0 0 0 0 21.6' }, { d: 'M12.6 1.2a20.4 20.4 0 0 1 0 21.6' }] }],
	instagram: ["Instagram", {"paths": [{"d": "M128 23.064c34.177 0 38.225.13 51.722.745 12.48.57 19.258 2.655 23.769 4.408 5.974 2.322 10.238 5.096 14.717 9.575 4.48 4.479 7.253 8.743 9.575 14.717 1.753 4.511 3.838 11.289 4.408 23.768.615 13.498.745 17.546.745 51.723 0 34.178-.13 38.226-.745 51.723-.57 12.48-2.655 19.257-4.408 23.768-2.322 5.974-5.096 10.239-9.575 14.718-4.479 4.479-8.743 7.253-14.717 9.574-4.511 1.753-11.289 3.839-23.769 4.408-13.495.616-17.543.746-51.722.746-34.18 0-38.228-.13-51.723-.746-12.48-.57-19.257-2.655-23.768-4.408-5.974-2.321-10.239-5.095-14.718-9.574-4.479-4.48-7.253-8.744-9.574-14.718-1.753-4.51-3.839-11.288-4.408-23.768-.616-13.497-.746-17.545-.746-51.723 0-34.177.13-38.225.746-51.722.57-12.48 2.655-19.258 4.408-23.769 2.321-5.974 5.095-10.238 9.574-14.717 4.48-4.48 8.744-7.253 14.718-9.575 4.51-1.753 11.288-3.838 23.768-4.408 13.497-.615 17.545-.745 51.723-.745M128 0C93.237 0 88.878.147 75.226.77c-13.625.622-22.93 2.786-31.071 5.95-8.418 3.271-15.556 7.648-22.672 14.764C14.367 28.6 9.991 35.738 6.72 44.155 3.555 52.297 1.392 61.602.77 75.226.147 88.878 0 93.237 0 128c0 34.763.147 39.122.77 52.774.622 13.625 2.785 22.93 5.95 31.071 3.27 8.417 7.647 15.556 14.763 22.672 7.116 7.116 14.254 11.492 22.672 14.763 8.142 3.165 17.446 5.328 31.07 5.95 13.653.623 18.012.77 52.775.77s39.122-.147 52.774-.77c13.624-.622 22.929-2.785 31.07-5.95 8.418-3.27 15.556-7.647 22.672-14.763 7.116-7.116 11.493-14.254 14.764-22.672 3.164-8.142 5.328-17.446 5.95-31.07.623-13.653.77-18.012.77-52.775s-.147-39.122-.77-52.774c-.622-13.624-2.786-22.929-5.95-31.07-3.271-8.418-7.648-15.556-14.764-22.672C227.4 14.368 220.262 9.99 211.845 6.72c-8.142-3.164-17.447-5.328-31.071-5.95C167.122.147 162.763 0 128 0Zm0 62.27C91.698 62.27 62.27 91.7 62.27 128c0 36.302 29.428 65.73 65.73 65.73 36.301 0 65.73-29.428 65.73-65.73 0-36.301-29.429-65.73-65.73-65.73Zm0 108.397c-23.564 0-42.667-19.103-42.667-42.667S104.436 85.333 128 85.333s42.667 19.103 42.667 42.667-19.103 42.667-42.667 42.667Zm83.686-110.994c0 8.484-6.876 15.36-15.36 15.36-8.483 0-15.36-6.876-15.36-15.36 0-8.483 6.877-15.36 15.36-15.36 8.484 0 15.36 6.877 15.36 15.36Z"}], "xmlns": "http://www.w3.org/2000/svg", "width": "1em", "height": "1em", "preserveAspectRatio": "xMidYMid", "viewBox": "0 0 256 256", "style": {"--dark": "#000", "--light": "#fff"}, "svgClass": "instagramSvg"}],
	threads: ["Threads", {"paths": [{"d": "M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.194 47.292 9.642 32.788 28.08 19.882 44.485 13.224 67.315 13.001 95.932L13 96v.067c.224 28.617 6.882 51.447 19.788 67.854C47.292 182.358 68.882 191.806 96.957 192h.113c24.96-.173 42.554-6.708 57.048-21.189 18.963-18.945 18.392-42.692 12.142-57.27-4.484-10.454-13.033-18.945-24.723-24.553ZM98.44 129.507c-10.44.588-21.286-4.098-21.82-14.135-.397-7.442 5.296-15.746 22.461-16.735 1.966-.114 3.895-.169 5.79-.169 6.235 0 12.068.606 17.371 1.765-1.978 24.702-13.58 28.713-23.802 29.274Z"}], "xmlns": "http://www.w3.org/2000/svg", "aria-label": "Threads", "viewBox": "0 0 192 192", "width": "1em", "fill": "none", "height": "1em", "style": {"--dark": "#000", "--light": "#fff"}, "svgClass": "threadsSvg"}],
	youtube: ["YouTube", {"paths": [{"d": "M250.346 28.075A32.18 32.18 0 0 0 227.69 5.418C207.824 0 127.87 0 127.87 0S47.912.164 28.046 5.582A32.18 32.18 0 0 0 5.39 28.24c-6.009 35.298-8.34 89.084.165 122.97a32.18 32.18 0 0 0 22.656 22.657c19.866 5.418 99.822 5.418 99.822 5.418s79.955 0 99.82-5.418a32.18 32.18 0 0 0 22.657-22.657c6.338-35.348 8.291-89.1-.164-123.134Z", "fill": "red"}, {"fill": "#FFF", "d": "m102.421 128.06 66.328-38.418-66.328-38.418z"}], "viewBox": "0 0 256 180", "width": "1em", "height": "1em", "xmlns": "http://www.w3.org/2000/svg", "preserveAspectRatio": "xMidYMid"}],
	twitch: ["Twitch", {"paths": [{"d": "m2200 1300-400 400h-400l-350 350v-350H600V200h1600z", "fill": "#fff"}, {"d": "M500 0 0 500v1800h600v500l500-500h400l900-900V0H500zm1700 1300-400 400h-400l-350 350v-350H600V200h1600v1100z", "fill": "#9146ff"}, {"d": "M1700 550h200v600h-200zM1150 550h200v600h-200z", "fill": "#9146ff"}], "xmlns": "http://www.w3.org/2000/svg", "viewBox": "0 0 2400 2800", "width": "1em", "height": "1em", "x": "0", "y": "0"}],
	email: ["Email", {"paths": [{"stroke": "none", "d": "M0 0h24v24H0z"}, {"d": "M7.2 12a4.8 4.8 0 1 0 9.6 0 4.8 4.8 0 1 0-9.6 0"}, {"d": "M16.8 12v1.8a3 3 0 0 0 6 0V12a10.8 10.8 0 1 0-6.6 9.936"}], "xmlns": "http://www.w3.org/2000/svg", "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "strokeLinecap": "round", "strokeLinejoin": "round", "strokeWidth": "2"}],
	stackoverflow: ["Stack Overflow", {"paths": [{"d": "M140.44 178.38v-48.65h21.61V200H0v-70.27h21.61v48.65z", "fill": "#bcbbbb"}, {"d": "M124.24 140.54l4.32-16.22-86.97-17.83-3.78 17.83zM49.7 82.16L130.72 120l7.56-16.22-81.02-37.83zm22.68-40l68.06 57.3 11.35-13.51-68.6-57.3-11.35 13.51zM116.14 0l-14.59 10.81 53.48 71.89 14.58-10.81zM37.81 162.16h86.43v-16.21H37.81z", "fill": "#f48024"}], "xmlns": "http://www.w3.org/2000/svg", "viewBox": "0 0 169.61 200", "width": "1em", "height": "1em"}],
	twitter: ['Twitter', { viewBox: '0 0 256 209', preserveAspectRatio: 'xMidYMid', paths: [{ d: 'M256 25.45c-9.42 4.177-19.542 7-30.166 8.27 10.845-6.5 19.172-16.793 23.093-29.057a105.183 105.183 0 0 1-33.351 12.745C205.995 7.201 192.346.822 177.239.822c-29.006 0-52.523 23.516-52.523 52.52 0 4.117.465 8.125 1.36 11.97-43.65-2.191-82.35-23.1-108.255-54.876-4.52 7.757-7.11 16.78-7.11 26.404 0 18.222 9.273 34.297 23.365 43.716a52.312 52.312 0 0 1-23.79-6.57c-.003.22-.003.44-.003.661 0 25.447 18.104 46.675 42.13 51.5a52.592 52.592 0 0 1-23.718.9c6.683 20.866 26.08 36.05 49.062 36.475-17.975 14.086-40.622 22.483-65.228 22.483-4.24 0-8.42-.249-12.529-.734 23.243 14.902 50.85 23.597 80.51 23.597 96.607 0 149.434-80.031 149.434-149.435 0-2.278-.05-4.543-.152-6.795A106.748 106.748 0 0 0 256 25.45', fill: '#55acee' }] }],
	github: ['GitHub', { width: '1em', height: '1em', viewBox: '0 0 256 250', preserveAspectRatio: 'xMidYMid', style: { '--dark': '#000', '--light': '#fff' }, svgClass: 'githubSvg', paths: [{ d: 'M128.001 0C57.317 0 0 57.307 0 128.001c0 56.554 36.676 104.535 87.535 121.46 6.397 1.185 8.746-2.777 8.746-6.158 0-3.052-.12-13.135-.174-23.83-35.61 7.742-43.124-15.103-43.124-15.103-5.823-14.795-14.213-18.73-14.213-18.73-11.613-7.944.876-7.78.876-7.78 12.853.902 19.621 13.19 19.621 13.19 11.417 19.568 29.945 13.911 37.249 10.64 1.149-8.272 4.466-13.92 8.127-17.116-28.431-3.236-58.318-14.212-58.318-63.258 0-13.975 5-25.394 13.188-34.358-1.329-3.224-5.71-16.242 1.24-33.874 0 0 10.749-3.44 35.21 13.121 10.21-2.836 21.16-4.258 32.038-4.307 10.878.049 21.837 1.47 32.066 4.307 24.431-16.56 35.165-13.12 35.165-13.12 6.967 17.63 2.584 30.65 1.255 33.873 8.207 8.964 13.173 20.383 13.173 34.358 0 49.163-29.944 59.988-58.447 63.157 4.591 3.972 8.682 11.762 8.682 23.704 0 17.126-.148 30.91-.148 35.126 0 3.407 2.304 7.398 8.792 6.14C219.37 232.5 256 184.537 256 128.002 256 57.307 198.691 0 128.001 0Zm-80.06 182.34c-.282.636-1.283.827-2.194.39-.929-.417-1.45-1.284-1.15-1.922.276-.655 1.279-.838 2.205-.399.93.418 1.46 1.293 1.139 1.931Zm6.296 5.618c-.61.566-1.804.303-2.614-.591-.837-.892-.994-2.086-.375-2.66.63-.566 1.787-.301 2.626.591.838.903 1 2.088.363 2.66Zm4.32 7.188c-.785.545-2.067.034-2.86-1.104-.784-1.138-.784-2.503.017-3.05.795-.547 2.058-.055 2.861 1.075.782 1.157.782 2.522-.019 3.08Zm7.304 8.325c-.701.774-2.196.566-3.29-.49-1.119-1.032-1.43-2.496-.726-3.27.71-.776 2.213-.558 3.315.49 1.11 1.03 1.45 2.505.701 3.27Zm9.442 2.81c-.31 1.003-1.75 1.459-3.199 1.033-1.448-.439-2.395-1.613-2.103-2.626.301-1.01 1.747-1.484 3.207-1.028 1.446.436 2.396 1.602 2.095 2.622Zm10.744 1.193c.036 1.055-1.193 1.93-2.715 1.95-1.53.034-2.769-.82-2.786-1.86 0-1.065 1.202-1.932 2.733-1.958 1.522-.03 2.768.818 2.768 1.868Zm10.555-.405c.182 1.03-.875 2.088-2.387 2.37-1.485.271-2.861-.365-3.05-1.386-.184-1.056.893-2.114 2.376-2.387 1.514-.263 2.868.356 3.061 1.403Z' }] }],
	x: ['X', { width: '1em', height: '1em', fill: 'none', viewBox: '0 0 1200 1227', style: { '--dark': '#000', '--light': '#fff' }, svgClass: 'xSvg', paths: [{ d: 'M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z' }] }],
	linkedin: ['LinkedIn', { width: '1em', height: '1em', preserveAspectRatio: 'xMidYMid', viewBox: '0 0 256 256', style: { '--dark': '#0a66c2', '--light': '#ffffffe6' }, svgClass: 'linkedinSvg', paths: [{ d: 'M218.123 218.127h-37.931v-59.403c0-14.165-.253-32.4-19.728-32.4-19.756 0-22.779 15.434-22.779 31.369v60.43h-37.93V95.967h36.413v16.694h.51a39.907 39.907 0 0 1 35.928-19.733c38.445 0 45.533 25.288 45.533 58.186l-.016 67.013ZM56.955 79.27c-12.157.002-22.014-9.852-22.016-22.009-.002-12.157 9.851-22.014 22.008-22.016 12.157-.003 22.014 9.851 22.016 22.008A22.013 22.013 0 0 1 56.955 79.27m18.966 138.858H37.95V95.967h37.97v122.16ZM237.033.018H18.89C8.58-.098.125 8.161-.001 18.471v219.053c.122 10.315 8.576 18.582 18.89 18.474h218.144c10.336.128 18.823-8.139 18.966-18.474V18.454c-.147-10.33-8.635-18.588-18.966-18.453' }] }],
	bluesky: ['Bluesky', { width: '1em', height: '1em', preserveAspectRatio: 'xMidYMid', viewBox: '0 0 256 226', style: { '--dark': '#0085ff', '--light': '#0085ff' }, svgClass: 'blueskySvg', paths: [{ d: 'M55.491 15.172c29.35 22.035 60.917 66.712 72.509 90.686 11.592-23.974 43.159-68.651 72.509-90.686C221.686-.727 256-13.028 256 26.116c0 7.818-4.482 65.674-7.111 75.068-9.138 32.654-42.436 40.983-72.057 35.942 51.775 8.812 64.946 38 36.501 67.187-54.021 55.433-77.644-13.908-83.696-31.676-1.11-3.257-1.63-4.78-1.637-3.485-.008-1.296-.527.228-1.637 3.485-6.052 17.768-29.675 87.11-83.696 31.676-28.445-29.187-15.274-58.375 36.5-67.187-29.62 5.041-62.918-3.288-72.056-35.942C4.482 91.79 0 33.934 0 26.116 0-13.028 34.314-.727 55.491 15.172Z' }] }],
};

// theme-classic's Mastodon icon fills with a gradient whose id comes from React's useId; any id unique on the page draws the same.
let mastodonGradients = 0;
function MastodonIcon({ className }) {
	const id = `mm-mastodon-${++mastodonGradients}`;
	return (
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 61 65" width="1em" height="1em" className={className}>
			<path fill={`url(#${id})`} d="M60.754 14.39C59.814 7.406 53.727 1.903 46.512.836 45.294.656 40.682 0 29.997 0h-.08C19.23 0 16.938.656 15.72.836 8.705 1.873 2.299 6.82.745 13.886c-.748 3.48-.828 7.338-.689 10.877.198 5.075.237 10.142.697 15.197a71.482 71.482 0 0 0 1.664 9.968c1.477 6.056 7.458 11.096 13.317 13.152a35.718 35.718 0 0 0 19.484 1.028 28.365 28.365 0 0 0 2.107-.576c1.572-.5 3.413-1.057 4.766-2.038a.154.154 0 0 0 .062-.118v-4.899a.146.146 0 0 0-.055-.111.145.145 0 0 0-.122-.028 54 54 0 0 1-12.644 1.478c-7.328 0-9.298-3.478-9.863-4.925a15.258 15.258 0 0 1-.857-3.882.142.142 0 0 1 .178-.145 52.976 52.976 0 0 0 12.437 1.477c1.007 0 2.012 0 3.02-.026 4.213-.119 8.654-.334 12.8-1.144.103-.02.206-.038.295-.065 6.539-1.255 12.762-5.196 13.394-15.176.024-.393.083-4.115.083-4.523.003-1.386.446-9.829-.065-15.017Z"></path>
			<path fill="#fff" d="M50.394 22.237v17.35H43.52V22.749c0-3.545-1.478-5.353-4.483-5.353-3.303 0-4.958 2.139-4.958 6.364v9.217h-6.835V23.76c0-4.225-1.657-6.364-4.96-6.364-2.988 0-4.48 1.808-4.48 5.353v16.84H10.93V22.237c0-3.545.905-6.362 2.715-8.45 1.868-2.082 4.317-3.152 7.358-3.152 3.519 0 6.178 1.354 7.951 4.057l1.711 2.871 1.714-2.871c1.773-2.704 4.432-4.056 7.945-4.056 3.038 0 5.487 1.069 7.36 3.152 1.81 2.085 2.712 4.902 2.71 8.449Z"></path>
			<defs>
				<linearGradient id={id} x1="30.5" x2="30.5" y1="0" y2="65" gradientUnits="userSpaceOnUse">
					<stop stop-color="#6364FF"></stop>
					<stop offset="1" stop-color="#563ACC"></stop>
				</linearGradient>
			</defs>
		</svg>
	);
}

function SocialIcon({ platform, className }) {
	if (platform === 'mastodon') return <MastodonIcon className={className} />;
	const entry = socialIcons[platform] ?? [platform, socialIcons.default[1]];
	const { paths, svgClass, ...attrs } = entry[1];
	const own = svgClass ? styles(`Icon/Socials/${entry[0] === 'LinkedIn' ? 'LinkedIn' : entry[0]}`)[svgClass] : undefined;
	return (
		<svg xmlns="http://www.w3.org/2000/svg" {...attrs} className={clsx(className, own)}>
			{paths.map((p) => (
				<path {...p}></path>
			))}
		</svg>
	);
}

function MaybeLink(props) {
	return props.href ? <Link {...props} /> : <>{props.children}</>;
}

export function BlogAuthor({ as, author, className, count }) {
	const s = styles('Blog/Components/Author');
	const social = styles('Blog/Components/Author/Socials');
	const { name, title, url, imageURL, email, page } = author;
	const link = page?.permalink || url || (email && `mailto:${email}`) || undefined;
	return (
		<div className={clsx('avatar margin-bottom--sm', className, s[`author-as-${as}`])}>
			{imageURL && (
				<MaybeLink href={link} className="avatar__photo-link">
					<img className={clsx('avatar__photo', s.authorImage)} src={imageURL} alt={name} />
				</MaybeLink>
			)}
			{(name || title) && (
				<div className={clsx('avatar__intro', s.authorDetails)}>
					<div className="avatar__name">
						{name && (
							<MaybeLink href={link}>
								{as ? (
									<Heading as={as} className={s.authorName} translate="no">
										{name}
									</Heading>
								) : (
									<span className={s.authorName} translate="no">
										{name}
									</span>
								)}
							</MaybeLink>
						)}
						{count !== undefined && <span className={clsx(s.authorBlogPostCount)}>{count}</span>}
					</div>
					{!!title && (
						<small className={s.authorTitle} title={title}>
							{title}
						</small>
					)}
					<div className={social.authorSocials}>
						{Object.entries(author.socials ?? {}).map(([platform, href]) => (
							<Link className={social.authorSocialLink} href={href} title={platform === 'mastodon' ? 'Mastodon' : socialIcons[platform] && platform !== 'default' ? socialIcons[platform][0] : platform}>
								<SocialIcon platform={platform} className={clsx(social.authorSocialIcon)} />
							</Link>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function BlogPostItemHeaderTitle({ className }) {
	const { metadata, isBlogPostPage } = post();
	const TitleHeading = isBlogPostPage ? 'h1' : 'h2';
	return <TitleHeading className={clsx(styles('BlogPostItem/Header/Title').title, className)}>{isBlogPostPage ? metadata.title : <Link to={metadata.permalink}>{metadata.title}</Link>}</TitleHeading>;
}

function BlogPostItemHeaderInfo({ className }) {
	const { metadata } = post();
	const formatted = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(metadata.date));
	const minutes = Math.ceil(metadata.readingTime ?? 0);
	return (
		<div className={clsx(styles('BlogPostItem/Header/Info').container, 'margin-vert--md', className)}>
			<time dateTime={metadata.date}>{formatted}</time>
			{typeof metadata.readingTime !== 'undefined' && (
				<>
					{' · '}
					{plural(minutes, translate({ id: 'theme.blog.post.readingTime.plurals', message: 'One min read|{readingTime} min read' }, { readingTime: minutes }))}
				</>
			)}
		</div>
	);
}

function BlogPostItemHeaderAuthors({ className }) {
	const { metadata, assets } = post();
	const authors = metadata.authors;
	if (authors.length === 0) return null;
	const s = styles('BlogPostItem/Header/Authors');
	const imageOnly = authors.every(({ name }) => !name);
	const single = authors.length === 1;
	return (
		<div className={clsx('margin-top--md margin-bottom--sm', imageOnly ? s.imageOnlyAuthorRow : 'row', className)}>
			{authors.map((author, idx) => (
				<div className={clsx(!imageOnly && (single ? 'col col--12' : 'col col--6'), imageOnly ? s.imageOnlyAuthorCol : s.authorCol)}>
					<BlogAuthor author={{ ...author, imageURL: assets.authorsImageUrls?.[idx] ?? author.imageURL }} />
				</div>
			))}
		</div>
	);
}

function BlogPostItemContent({ children, className }) {
	const { isBlogPostPage } = post();
	return (
		<div id={isBlogPostPage ? '__blog-post-container' : undefined} className={clsx('markdown', className)}>
			{children}
		</div>
	);
}

function BlogPostItemFooter() {
	const { metadata, isBlogPostPage } = post();
	const { tags, title, editUrl, hasTruncateMarker, lastUpdatedBy, lastUpdatedAt } = metadata;
	const truncated = !isBlogPostPage && hasTruncateMarker;
	const tagsExist = tags.length > 0;
	if (!(tagsExist || truncated || editUrl)) return null;
	if (isBlogPostPage) {
		return (
			<footer className="docusaurus-mt-lg">
				{tagsExist && (
					<div className={clsx('row', 'margin-top--sm', ThemeClassNames.blog.blogFooterEditMetaRow)}>
						<div className="col">
							<TagsListInline tags={tags} />
						</div>
					</div>
				)}
				{!!(editUrl || lastUpdatedAt || lastUpdatedBy) && <EditMetaRow className={clsx('margin-top--sm', ThemeClassNames.blog.blogFooterEditMetaRow)} editUrl={editUrl} lastUpdatedAt={lastUpdatedAt} lastUpdatedBy={lastUpdatedBy} />}
			</footer>
		);
	}
	return (
		<footer className="row docusaurus-mt-lg">
			{tagsExist && (
				<div className={clsx('col', { 'col--9': truncated })}>
					<TagsListInline tags={tags} />
				</div>
			)}
			{truncated && (
				<div className={clsx('col text--right', { 'col--3': tagsExist })}>
					<Link aria-label={translate({ message: 'Read more about {title}', id: 'theme.blog.post.readMoreLabel' }, { title })} to={metadata.permalink}>
						<b>
							<Translate id="theme.blog.post.readMore">Read more</Translate>
						</b>
					</Link>
				</div>
			)}
		</footer>
	);
}

export function BlogPostItem({ children, className }) {
	const { isBlogPostPage } = post();
	return (
		<article className={clsx(!isBlogPostPage ? 'margin-bottom--xl' : undefined, className)}>
			<header>
				<BlogPostItemHeaderTitle />
				<BlogPostItemHeaderInfo />
				<BlogPostItemHeaderAuthors />
			</header>
			<BlogPostItemContent>{children}</BlogPostItemContent>
			<BlogPostItemFooter />
		</article>
	);
}

// Each list item renders with its own post in the context, as BlogPostProvider does.
function withPost(content, isBlogPostPage, render) {
	const ctx = useContext();
	const previous = ctx.blogPost;
	ctx.blogPost = { metadata: content.metadata, frontMatter: content.frontMatter, assets: content.assets ?? {}, toc: content.toc, isBlogPostPage };
	try {
		return render();
	} finally {
		ctx.blogPost = previous;
	}
}

export function BlogPostItems({ items, component: Item = BlogPostItem }) {
	return items.map(({ content: Content }) =>
		withPost(Content, false, () =>
			renderNow(
				<Item>
					<MDXContent>
						<Content />
					</MDXContent>
				</Item>,
			),
		),
	);
}
// The list items need their own post context while they render, so they are rendered right away.
import { render as renderTree } from '../source/h.mjs';
function renderNow(element) {
	return renderTree(element);
}

function BlogListPaginator({ metadata }) {
	const { previousPage, nextPage } = metadata;
	return (
		<nav className="pagination-nav" aria-label={translate({ id: 'theme.blog.paginator.navAriaLabel', message: 'Blog list page navigation' })}>
			{previousPage && <PaginatorNavLink permalink={previousPage} title={<Translate id="theme.blog.paginator.newerEntries">Newer entries</Translate>} />}
			{nextPage && <PaginatorNavLink permalink={nextPage} title={<Translate id="theme.blog.paginator.olderEntries">Older entries</Translate>} isNext />}
		</nav>
	);
}

function postStructuredData(content) {
	const { siteConfig } = useContext();
	const { assets = {}, frontMatter, metadata } = content;
	const image = assets.image ?? frontMatter.image;
	const keywords = frontMatter.keywords ?? [];
	const url = absoluteUrl(metadata.permalink);
	const person = (a) => ({ '@type': 'Person', ...(a.name ? { name: a.name } : {}), ...(a.title ? { description: a.title } : {}), ...(a.url ? { url: a.url } : {}), ...(a.email ? { email: a.email } : {}), ...(a.imageURL ? { image: a.imageURL } : {}) });
	const authors = metadata.authors.map(person);
	const imageUrl = image ? withBaseUrl(image, { absolute: true }) : undefined;
	void siteConfig;
	return {
		'@type': 'BlogPosting',
		'@id': url,
		mainEntityOfPage: url,
		url,
		headline: metadata.title,
		name: metadata.title,
		description: metadata.description,
		datePublished: metadata.date,
		...(metadata.lastUpdatedAt ? { dateModified: new Date(metadata.lastUpdatedAt).toISOString() } : {}),
		author: authors.length === 1 ? authors[0] : authors,
		...(imageUrl ? { image: { '@type': 'ImageObject', '@id': imageUrl, url: imageUrl, contentUrl: imageUrl, caption: `title image for the blog post: ${metadata.title}` } } : {}),
		...(keywords ? { keywords } : {}),
	};
}

export function BlogListPage({ metadata, items, sidebar }) {
	const { siteConfig } = useContext();
	const { blogDescription, blogTitle, permalink } = metadata;
	const url = absoluteUrl(permalink);
	const structured = { '@context': 'https://schema.org', '@type': 'Blog', '@id': url, mainEntityOfPage: url, headline: blogTitle, description: blogDescription, blogPost: items.map((item) => postStructuredData(item.content)) };
	return (
		<>
			<PageMetadata title={permalink === '/' ? siteConfig.title : blogTitle} description={blogDescription} />
			<SearchMetadata tag="blog_posts_list" />
			<Head>
				<script type="application/ld+json">{JSON.stringify(structured)}</script>
			</Head>
			<BlogLayout sidebar={sidebar}>
				<BlogPostItems items={items} />
				<BlogListPaginator metadata={metadata} />
			</BlogLayout>
		</>
	);
}

function BlogPostPageMetadata() {
	const { assets, metadata, frontMatter } = post();
	const { title, description, date, tags, authors } = metadata;
	const image = assets.image ?? frontMatter.image;
	return (
		<PageMetadata title={frontMatter.title_meta ?? title} description={description} keywords={frontMatter.keywords} image={image}>
			<meta property="og:type" content="article" />
			<meta property="article:published_time" content={date} />
			{authors.some((a) => a.url) && <meta property="article:author" content={authors.map((a) => a.url).filter(Boolean).join(',')} />}
			{tags.length > 0 && <meta property="article:tag" content={tags.map((t) => t.label).join(',')} />}
		</PageMetadata>
	);
}

function postPageToc() {
	const { metadata, toc } = post();
	const { frontMatter } = metadata;
	return !frontMatter.hide_table_of_contents && toc.length > 0 ? <TOC toc={toc} minHeadingLevel={frontMatter.toc_min_heading_level} maxHeadingLevel={frontMatter.toc_max_heading_level} /> : undefined;
}

function postPaginator(prevLabel, nextLabel, aria) {
	const { nextItem, prevItem } = post().metadata;
	if (!(nextItem || prevItem)) return null;
	return (
		<nav className="pagination-nav docusaurus-mt-lg" aria-label={translate(aria)}>
			{prevItem && <PaginatorNavLink {...prevItem} subLabel={<Translate id={prevLabel.id}>{prevLabel.message}</Translate>} />}
			{nextItem && <PaginatorNavLink {...nextItem} subLabel={<Translate id={nextLabel.id}>{nextLabel.message}</Translate>} isNext />}
		</nav>
	);
}

export function BlogPostPage({ content: Content, sidebar }) {
	return withPost(Content, true, () => {
		const blogMetadata = useContext().blogMetadata;
		const structured = { '@context': 'https://schema.org', ...postStructuredData(Content), isPartOf: { '@type': 'Blog', '@id': absoluteUrl(blogMetadata.blogBasePath), name: blogMetadata.blogTitle } };
		const { metadata } = post();
		return renderNow(
			<>
				<BlogPostPageMetadata />
				<Head>
					<script type="application/ld+json">{JSON.stringify(structured)}</script>
				</Head>
				<BlogLayout sidebar={sidebar} toc={postPageToc()}>
					<ContentVisibility metadata={metadata} />
					<BlogPostItem>
						<MDXContent>
						<Content />
					</MDXContent>
					</BlogPostItem>
					{postPaginator({ id: 'theme.blog.post.paginator.newerPost', message: 'Newer post' }, { id: 'theme.blog.post.paginator.olderPost', message: 'Older post' }, { id: 'theme.blog.post.paginator.navAriaLabel', message: 'Blog post page navigation' })}
				</BlogLayout>
			</>,
		);
	});
}

export function BlogTagsListPage({ tags, sidebar }) {
	const title = translate({ id: 'theme.tags.tagsPageTitle', message: 'Tags' });
	return (
		<>
			<PageMetadata title={title} />
			<SearchMetadata tag="blog_tags_list" />
			<BlogLayout sidebar={sidebar}>
				<Heading as="h1">{title}</Heading>
				<TagsListByLetter tags={tags} />
			</BlogLayout>
		</>
	);
}

export function BlogTagsPostsPage({ tag, items, sidebar, listMetadata }) {
	const title = blogTagsPostsPageTitle(tag);
	return (
		<>
			<PageMetadata title={title} description={tag.description} />
			<SearchMetadata tag="blog_tags_posts" />
			<BlogLayout sidebar={sidebar}>
				{tag.unlisted && <Unlisted />}
				<header className="margin-bottom--xl">
					<Heading as="h1">{title}</Heading>
					{tag.description && <p>{tag.description}</p>}
					<Link href={tag.allTagsPath}>
						<Translate id="theme.tags.tagsPageLink">View all tags</Translate>
					</Link>
				</header>
				<BlogPostItems items={items} />
				<BlogListPaginator metadata={listMetadata} />
			</BlogLayout>
		</>
	);
}

export function BlogArchivePage({ archive }) {
	const title = translate({ id: 'theme.blog.archive.title', message: 'Archive' });
	const description = translate({ id: 'theme.blog.archive.description', message: 'Archive' });
	const byYear = archive.blogPosts.reduce((map, p) => {
		const year = p.metadata.date.split('-')[0];
		return map.set(year, [p, ...(map.get(year) ?? [])]);
	}, new Map());
	const years = [...byYear].map(([year, posts]) => ({ year, posts }));
	const format = (date) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(date));
	return (
		<>
			<PageMetadata title={title} description={description} />
			<Layout>
				<header className="hero hero--primary">
					<div className="container">
						<Heading as="h1" className="hero__title">
							{title}
						</Heading>
						<p className="hero__subtitle">{description}</p>
					</div>
				</header>
				<main>
					{years.length > 0 && (
						<section className="margin-vert--lg">
							<div className="container">
								<div className="row">
									{years.map(({ year, posts }) => (
										<div className="col col--4 margin-vert--lg">
											<Heading as="h3" id={year}>
												{year}
											</Heading>
											<ul>
												{posts.map((p) => (
													<li>
														<Link to={p.metadata.permalink}>
															{format(p.metadata.date)} - {p.metadata.title}
														</Link>
													</li>
												))}
											</ul>
										</div>
									))}
								</div>
							</div>
						</section>
					)}
				</main>
			</Layout>
		</>
	);
}

export function BlogAuthorsListPage({ authors, sidebar }) {
	const title = translate({ id: 'theme.blog.authorsList.pageTitle', message: 'Authors' });
	const s = styles('Blog/Pages/BlogAuthorsListPage');
	return (
		<>
			<PageMetadata title={title} />
			<SearchMetadata tag="blog_authors_list" />
			<BlogLayout sidebar={sidebar}>
				<Heading as="h1">{title}</Heading>
				<section className={clsx('margin-vert--lg', s.authorsListSection)}>
					<ul>
						{authors.map((author) => (
							<li className={s.authorListItem}>
								<BlogAuthor as="h2" author={author} count={author.count} />
							</li>
						))}
					</ul>
				</section>
			</BlogLayout>
		</>
	);
}

export function BlogAuthorsPostsPage({ author, items, sidebar, listMetadata }) {
	const { blogMetadata } = useContext();
	return (
		<>
			<PageMetadata title={blogAuthorPageTitle(author)} />
			<SearchMetadata tag="blog_authors_posts" />
			<BlogLayout sidebar={sidebar}>
				<header className="margin-bottom--xl">
					<BlogAuthor as="h1" author={author} />
					{author.description && <p>{author.description}</p>}
					<Link href={blogMetadata.authorsListPath}>
						<Translate id="theme.blog.authorsList.viewAll">View all authors</Translate>
					</Link>
				</header>
				{items.length === 0 ? (
					<p>
						<Translate id="theme.blog.author.noPosts">This author has not written any posts yet.</Translate>
					</p>
				) : (
					<>
						<hr />
						<BlogPostItems items={items} />
						<BlogListPaginator metadata={listMetadata} />
					</>
				)}
			</BlogLayout>
		</>
	);
}

// The site's changelog theme.
const changelogStyles = (dir) => siteStyles(join('src/plugins/changelog/theme', dir, 'styles.module.css'));
const fallbackAvatar = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" fill="none" stroke="%2325c2a0" stroke-width="30" version="1.1"><circle cx="300" cy="230" r="115"/><path stroke-linecap="butt" d="M106.81863443903,481.4 a205,205 1 0,1 386.36273112194,0"/></svg>';
void fallbackAvatar;

function ChangelogAuthors({ className }) {
	const { metadata, assets } = post();
	const authors = metadata.authors;
	if (authors.length === 0) return null;
	const s = changelogStyles('ChangelogItem/Header/Authors');
	const author = changelogStyles('ChangelogItem/Header/Author');
	return (
		<div className={clsx('margin-top--md margin-bottom--sm', s.imageOnlyAuthorRow, className)}>
			{authors.slice(0, 10).map((a, idx) => {
				const imageURL = assets.authorsImageUrls?.[idx] ?? a.imageURL;
				return (
					<div className={s.imageOnlyAuthorCol}>
						<div className={clsx('avatar margin-bottom--sm')}>
							{imageURL && (
								<Link className="avatar__photo-link avatar__photo" href={a.url}>
									<img className={author.image} src={imageURL} alt={a.name} />
								</Link>
							)}
						</div>
					</div>
				);
			})}
			{authors.length > 10 && (
				<button className={clsx('clean-btn', s.toggleButton)} type="button" aria-label="expand" data-mm-changelog-authors={JSON.stringify(authors.slice(10).map((a, i) => ({ name: a.name, url: a.url, imageURL: assets.authorsImageUrls?.[i + 10] ?? a.imageURL })))}>
					<svg viewBox="0 0 1024 1024" width="20" height="20" fill="currentColor">
						<path d="M476.612887 1009.12034L169.240699 695.380437a51.981345 51.981345 0 0 1 0-72.319045 49.382277 49.382277 0 0 1 70.824582 0l271.959897 277.645356 271.862433-277.645356a49.382277 49.382277 0 0 1 70.824582 0 51.981345 51.981345 0 0 1 0 72.319045l-307.307212 313.739903a49.447254 49.447254 0 0 1-70.792094 0z m307.274724-608.116755L511.99269 123.455693l-271.959897 277.645357a49.382277 49.382277 0 0 1-70.824582 0 51.981345 51.981345 0 0 1 0-72.319045L476.580399 15.042102a49.382277 49.382277 0 0 1 70.727117 0l307.372188 313.739903a51.981345 51.981345 0 0 1 0 72.319045 49.414766 49.414766 0 0 1-70.824582 0z"></path>
					</svg>
				</button>
			)}
		</div>
	);
}

export function ChangelogItem({ children }) {
	const { isBlogPostPage } = post();
	return (
		<article className={changelogStyles('ChangelogItem').changelogItemContainer}>
			<header>
				<BlogPostItemHeaderTitle className={isBlogPostPage ? undefined : changelogStyles('ChangelogItem/Header').changelogItemTitleList} />
				<BlogPostItemHeaderInfo />
				<ChangelogAuthors />
			</header>
			<BlogPostItemContent>{children}</BlogPostItemContent>
		</article>
	);
}

function ChangelogListHeader({ blogTitle }) {
	const s = changelogStyles('ChangelogList/Header');
	return (
		<header className="margin-bottom--lg">
			<Heading as="h1" style={{ fontSize: '3rem' }}>
				{blogTitle}
			</Heading>
			<p>
				<Translate
					id="changelog.description"
					values={{
						xLink: (
							<Link href="https://x.com/docusaurus" className={s.x}>
								<b>X</b>
								<svg style={{ fill: '#1da1f2', position: 'relative', left: 4, top: 1, marginRight: 8 }} width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
									<path d="M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.583 298.558-298.558 298.558-59.452 0-114.68-17.219-161.137-47.106 8.447.974 16.568 1.299 25.34 1.299 49.055 0 94.213-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.498.974 12.995 1.624 19.818 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.431 13.319-28.264-18.843-46.781-51.005-46.781-87.391 0-19.492 5.197-37.36 14.294-52.954 51.655 63.675 129.3 105.258 216.365 109.807-1.624-7.797-2.599-15.918-2.599-24.04 0-57.828 46.782-104.934 104.934-104.934 30.213 0 57.502 12.67 76.67 33.137 23.715-4.548 46.456-13.32 66.599-25.34-7.798 24.366-24.366 44.833-46.132 57.827 21.117-2.273 41.584-8.122 60.426-16.243-14.292 20.791-32.161 39.308-52.628 54.253z"></path>
								</svg>
							</Link>
						),
						rssLink: (
							<Link href="pathname:///changelog/rss.xml" className={s.rss}>
								<b>
									<Translate id="changelog.description.rssLink">RSS feeds</Translate>
								</b>
								<svg style={{ fill: '#f26522', position: 'relative', left: 4, top: 1, marginRight: 8 }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
									<path d="M6.503 20.752c0 1.794-1.456 3.248-3.251 3.248-1.796 0-3.252-1.454-3.252-3.248 0-1.794 1.456-3.248 3.252-3.248 1.795.001 3.251 1.454 3.251 3.248zm-6.503-12.572v4.811c6.05.062 10.96 4.966 11.022 11.009h4.817c-.062-8.71-7.118-15.758-15.839-15.82zm0-3.368c10.58.046 19.152 8.594 19.183 19.188h4.817c-.03-13.231-10.755-23.954-24-24v4.812z"></path>
								</svg>
							</Link>
						),
					}}>
					{'Subscribe through {rssLink} or follow us on {xLink} to stay up-to-date with new releases!'}
				</Translate>
			</p>
		</header>
	);
}

export function ChangelogList({ metadata, items, sidebar }) {
	const { blogTitle, blogDescription } = metadata;
	return (
		<>
			<PageMetadata title={blogTitle} description={blogDescription} />
			<SearchMetadata tag="blog_posts_list" />
			<BlogLayout sidebar={sidebar}>
				<ChangelogListHeader blogTitle={blogTitle} />
				<BlogPostItems items={items} component={ChangelogItem} />
				<BlogListPaginator metadata={metadata} />
			</BlogLayout>
		</>
	);
}

export function ChangelogPage({ content: Content, sidebar }) {
	return withPost(Content, true, () =>
		renderNow(
			<>
				<BlogPostPageMetadata />
				<BlogLayout sidebar={sidebar} toc={postPageToc()}>
					<Link to={post().metadata.listPageLink}>
						<Translate id="changelog.backLink">← Back to index page</Translate>
					</Link>
					<ChangelogItem>
						<MDXContent>
						<Content />
					</MDXContent>
					</ChangelogItem>
					{postPaginator({ id: 'theme.changelog.post.paginator.newerRelease', message: 'Newer release' }, { id: 'theme.changelog.post.paginator.olderRelease', message: 'Older release' }, { id: 'theme.changelog.post.paginator.navAriaLabel', message: 'Changelog item navigation' })}
				</BlogLayout>
			</>,
		),
	);
}
