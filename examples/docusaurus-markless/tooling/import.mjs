// Builds the Markless pages from docusaurus.io's own sources: `node tooling/import.mjs [--only /route ...]`.
// The old site's content plugins read website/ (docs, sidebars, blog posts, the changelog, pages) as
// `docusaurus build` does; each route is then rendered by the importer for its page template (templates/), with
// the theme and the site's MDX components ported to static markup (theme/, ports/), and written as TSRX.
import './source/jsx-loader.mjs';

await import('./main.mjs');
