# Migration log: ui.shadcn.com (Next.js 16 + React 19) to Markless

[shadcn-ui/ui](https://github.com/shadcn-ui/ui) (MIT), `apps/v4`, at commit `ba1503c6` (2026-10-19), moved to
`examples/shadcn-ui-markless` through the pipeline: `plan`, `usage`, `convert` (new), `cache apply`, `check` and
`cli`. Nothing in the app's pages, shared components, copied assets or server handlers is written by hand: it is
`convert`'s output (`scripts/convert.sh`), gitignored and regenerated. What is written by hand is the site's own
client components ported to Markless (`lib/site/`), the part an agent writes in `run`.

## Old site

- `deploy/shadcn-ui/fetch-old.sh` clones the pinned commit and runs `pnpm --filter=v4 build` (registry build, then
  `next build`: 812 prerendered pages, about 6 minutes on an M-series Mac); `serve-old.sh` serves it on :4000.
- Deployed as https://mm-shadcn-ui-old.vercel.app. Vercel's own build of `apps/v4` hits the 45-minute limit
  (the Turbopack compile alone takes 17 minutes there), so `deploy.sh old` deploys a local `vercel build`
  (`--prebuilt`, 1.2 GB). One local prerender failed once on a reset connection to the GitHub API (the star count
  in the header) and passed on the retry.

## Plan

`plan --old http://localhost:4000 --source .../apps/v4 --limit 5000` (18 minutes):

- 521 routes to port: 498 HTML pages, 24 redirects, 5 links the old site answers 404 (left out), and the
  endpoints `/r/registries.json`, `/init`, `/init/md`, `/init/v0`, `/llm/*`, `/api/search`, `/og`, `/rss.xml`,
  `/typeset.css`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`.
- 6,607 registry JSON files under `/r/` are static files of the old build.
- 67 libraries. Rendering ones the pages use: radix-ui (89 parts with a data-slot), @base-ui/react (104),
  react-aria-components (only on routes no page renders by data-slot), cmdk, vaul, sonner, input-otp,
  react-day-picker, recharts, embla-carousel.

Shared parts, by how many of the 500 HTML routes render them (settled DOM, `data-slot` and the library's own
markup): Radix Popover 468, Radix Dialog 468 (the search palette), Radix DropdownMenu 446, Radix Tabs 325,
Base UI Select 173, Base UI Popover 169, Base UI Menu 35, Radix Collapsible 27, Radix ScrollArea 20,
Radix Select 16, Base UI Dialog 14, Tooltip (Radix 14, Base UI 11), Radix ToggleGroup 11, Radix Sheet 10,
vaul Drawer 8, Radix RadioGroup 7, Radix Slider 5.

## Pipeline changes (markless-migrate)

- `convert` (src/convert/, `markless-migrate convert`): every HTML route as a visitor's browser holds it (captured
  with check's frozen environment), the old framework's runtime left out (Next's chunks, `self.__next_f`, React's
  streaming `$RC`, `data-precedence`, `next-route-announcer`, streamed `<template>`s), shared regions as
  components (a link's attributes beside its href are left out when matching, so a nav is one component across
  pages), what controls show on use captured from the old page and rendered by Markless (tab panels and accordion
  items on state() with bound attributes, portaled layers hidden in the Document's extras), and assets copied byte
  for byte. Markless owns every node: parts switch attributes, measure, place and move focus, and a guard test
  fails on a part that inserts or removes nodes.
- The library part an element gets comes from the usage inventory (`PartResolver`, usage.json): the export the
  source renders with that `data-slot`. The markup only tells Radix's, Base UI's and cmdk's candidates apart.
  Prop defaults the source passes through (`sideOffset = 4`) are read from the component's parameters.
- `parts/`: Markless ports of library behaviour, each written once, delegated from the page root: Radix Dialog
  (driving the shared dialog engine from `library-port-radix-dialog`, vendored unchanged), Popover, DropdownMenu,
  Tabs and Collapsible/Accordion (convert's state plans, with roving focus and content measurement), Popper on @floating-ui/dom as Radix configures it, Presence, aria-hidden's
  hideOthers; Base UI Popover, Menu, Tooltip and Select (its anchor positioning, transition status, and
  `alignItemWithTrigger`); cmdk 1.1; next-themes.
- Revealed content a control replaces itself with (View Code) and what a control copies (Copy Page) are captured
  from the old page for controls the site lists (`lib/site/controls.json`); options without a link (the search
  palette's 450 items) get where choosing each went.
- Routing: a generated Nitro middleware answers the old config's redirects (308/307) and rewrites, runs each
  route handler as the old app's own server code (its local import closure, JSX data dropped, `next/server` on
  the Fetch API), and serves outputs only the old build can make. Markless's own middleware cannot answer a
  request (a returned Response is ignored), so this is Nitro middleware.
- `usage`: Next's build chunks are Next's (they were read as plain scripts, 1,499 "jQuery" uses from minified
  `$`), and a name a script binds is not the library global.
- `check`: scroll-driven animations are neither paused, seeked nor finished (seeking one in milliseconds threw
  and stopped every docs route's check).
- `cli`: a package manager the tool starts is not watched by the network shim (npm's registry traffic varies
  with its cache).
- The source scan tells redirects from rewrites and keeps `permanent`.

### Since Markless 0.8.0 (2026-10-20/21)

- All 498 pages convert and build in one app. Markless 0.8.0 from npm (vite-plus 1.3.0, Nitro 3.0.260903-beta);
  the local-main link scripts are gone.
- In-place controls on Markless state, from what each did on the old page (`toggles.ts` uses every checkbox,
  switch, pressed toggle and radio once and records the markup of each state): a `state()` per control or radio
  group binds each attribute that differs and renders the children of each state in an `@if` arm (a checkbox's
  indicator); the hidden native input Base UI puts beside the control (its label's target) binds `checked`. 355
  groups.
- Base UI Tabs (only the chosen panel is mounted: the panel element binds the chosen panel's id and label, with each
  tab's captured content in an arm) and disclosures that mount their content where they open (Base UI Collapsible
  and Accordion, Radix Collapsible content that leaves while closed, the AI elements' trace): the captured content
  is an arm at the place it went; an accordion item open on load closes when another opens.
- Parts: Radix Select with its item-aligned position (Radix's `SelectItemAlignedPosition`), typeahead and pointer
  rules, each option carrying a hidden copy of the indicator Radix mounts only in the checked one; Base UI Dialog,
  AlertDialog and Drawer (modal focus, scroll lock, backdrop); Radix and Base UI Slider.
- Each page imports the layers only it portals and renders them beside its root (both in branches on a module
  constant: Markless renders a fragment root of components only inside branches). The Document imported all 1,914
  layers before, one 78 MB server chunk that crashed V8's optimizing compiler (`Check failed: is_int26(x)`).
- Endpoints: a route handler that reads no request runs at convert time from the old app's directory, as Next.js's
  build runs a static route: `/rss.xml`, `/typeset.css`, `/r/registries.json` and the 383 `/docs/*.md` (`/llm/*`)
  answers are byte for byte the old ones. `app/sitemap.ts` and `app/robots.ts` run the same way and are written as
  Next.js writes them. `/og` runs on `@vercel/og` (what `next/og` compiles in, at Next's version) with the JSX as
  satori's element objects: pixel-identical PNGs. `/init/v0` no longer pulls the registry's React components: a
  dynamic `import()` counts in a handler's closure only inside code the handler reaches. `/api/search` answers as
  the old one (the collection keeps `structuredData` whose headings are `undefined`). `next/navigation`'s
  `notFound`/`redirect` are shimmed; the handlers' packages are traced into the server output, not bundled.
- Copy Page text is one module per page, loaded on use (2.3 MB in every page's client code before). Since 0.9.0 it
  is in the page's HTML instead (below).
- `cache`: a request read named in a string or a comment is not one (the copied page text mentions `headers()`,
  and every page had been planned never cached).
- `convert` peak memory: 3.1 to 3.5 GB (captures are read from the cache while their page is parsed, and only the
  served `<html>` tag is parsed); the 7.3 GB reported before was measured with every capture held at once.
- Parts that never opened on the new site: Base UI Preview Card (shadcn's hover card on Base UI), Context Menu and
  Navigation Menu (hover with 50 ms delays, press, switching between triggers, the content's
  `data-activation-direction`); Radix and Base UI Menubar (with one menu open, the pointer on another trigger opens it
  and the side arrows move between menus; Radix's menubar menus are not modal); the combobox popup variant (the
  trigger opens a dialog holding the search input, and choosing writes the item's text into the trigger).
- Toasts (Sonner, Base UI Toast) on Markless state: `notify` controls the site lists (`lib/site/controls.json`) are
  used once each on the old page and what they add inside a live region is an `@if` arm of that region; the page
  renders the region itself (the shared body children around it come from `BodyAfter` in two ranges), since the
  state lives in the page. 21 toasts on the four sonner and toast routes.
- An accordion that lets several items be open (Radix `type="multiple"`, Base UI `multiple`) gives each item its own
  state: `convert` opens two items of every accordion on the old page and reads whether the first stayed open.
- Hover cards carry their own delays: `convert` times each trigger on the old page (pointer in to open, out to
  closed) and writes the round delay at or below it (the timing includes the old page's render) on that trigger.
  The source alone cannot give them: the demos pass 10, 100 and 200 ms to different instances of one export.
- `usage` and the source scan: a module loaded with `import()` is rendered on the routes of the module that loads it.
  The registry loads every demo lazily, so Base UI Accordion, Collapsible, Combobox, Context Menu, Menubar,
  Navigation Menu, Preview Card and Scroll Area were missing from the usage inventory (185 Base UI exports reach a
  route now, 119 before).
- The part an element gets: a slot a wrapper passes on names the part the wrapped component renders
  (`<DropdownMenuTrigger data-slot="menubar-trigger">` is a Base UI `Menu.Trigger`), through chains of wrappers, and
  the libraries.json sites add to what the usage inventory lists for a slot instead of standing in only for a slot it
  lacks. Base UI's menubar triggers had been opened by the Radix port, by accident.
- Routing: the trailing-slash redirect leaves Markless's own paths alone; `/_markless/fragment/` (the home page's
  fragment) was redirected to `/_markless/fragment`, a 404.

### Since Markless 0.9.0 (2026-10-22)

- The app runs on tarballs packed from Markless main fb5840dd (package version 0.9.0: per-page build memory, compile
  results kept across builds), #37.
- Copy Page's text is in its page's HTML, a `<template data-mm-clipboard data-mm-text>` beside the page's layers, as
  the old page's props carried it; the click fetches nothing. The per-page modules behind `import()` came back as one
  2.3 MB chunk that the first click fetched (framework bug 13): `first interaction with button "Copy Page"` was red on
  46 of the 323 routes the stopped check reached (about 105 ms against the old 65 ms). The text is an attribute
  because text naming the old origin is an `APP_URL` expression, and Markless allows only literal template content. #39.
- Radix accordion and collapsible content open on load keeps the mount suppression its capture holds (`animation-name:
  none; transition-duration: 0s`); `panelExit` drops it before the first close as Radix does, so the item plays
  `accordion-up` instead of vanishing (#39). A Radix part's exit now waits for its `animationend` or
  `animationcancel`, as Presence does, not for `Animation.finished`.
- Base UI popups give focus back to their trigger once the exit has finished, as FloatingFocusManager does when the
  popup unmounts; a Select (its popup stays mounted) still does it at once. Escape on the RTL notice's popover kept
  focus in the popup for its 100 ms exit on the old page (`outline-width` 3px to 1px under `transition: all`), red
  on 12 to 14 routes.
- Parts: @shadcn/react MessageScroller (`parts/shadcn/message-scroller.ts`). It covers the opening position,
  following the live edge, holding a new anchored turn at the reading line with the previous row peeking above it,
  keeping the reader's row in place when earlier rows are prepended, `data-scrollable`, `data-autoscrolling`, and
  the scroll buttons. The provider renders no element, so `convert` reads each scroller's opening position from
  where it opened on the old page (`src/convert/scrollers.ts`). Each scroller keeps its server render's
  `data-pending-scroll` until the part places it as it comes into view, so it never shows at the wrong position
  first. Bubble and Marker buttons show the old page's toasts (`notify`). Before: Jumping to Messages, Tracking the
  Reader's Position and Reading Scroll State were broken. After: they work in the local witness. The demos whose
  Send, Load History, Add Rocky or Reset add or remove messages through the demo's own React state are still
  broken.
- Recorded demo state ("scenes", `src/convert/scenes.ts`, `src/convert/scene-plan.ts`, `parts/scene.ts`). Many of the
  chat demos drive themselves from their own React state: Send, Replay, Show more, Load History, Add Rocky, Reset.
  The site lists those controls (`lib/site/controls.json`, action `play`). `convert` then uses each one on the old
  page from every state it leads to (breadth first, up to 8 states), and records every frame the demo shows with
  its time from the click. A long use is timed again without snapshots, because snapshots slow the page down. On
  the port, one state per demo holds the frame shown:
  - A node that comes and goes is an `@if` arm per largest shape it takes. A reply that streams in is one arm,
    and the part hides the parts of it not shown yet and cuts its text to the frame's prefix.
  - Attributes and text that change on a node are written by the part on elements keyed `data-mm-k`, before paint.
  - A use that ends in a known state ends on that state's own nodes (React's new nodes are renamed to them).
  - Ids a framework generates per mount, and the scroll attributes the MessageScroller part computes, are not
    told apart in states.
  - Frames under 100 ms that the frames around them skip over (a token the highlighter split differently halfway
    through a stream) are left out.
  - What the old page changed as the click was handled changes in the same task on the port: the first change
    lands 0 to 1 ms after the click on both sides.
  - A demo whose uses would replace an element another plan already puts on Markless state (a disclosure, a tab,
    a toggle) is not played. Convert logs it. The trace demo's Replay is one such demo: it rebuilds collapsibles
    that the disclosure plan owns.
  - Forms in played demos, like every handled form, carry `data-mm-form`. A delegated `submit` part prevents
    their native submission (framework bug 14, below).
  Cost: the code-block Streaming demo's region is 105 KB of tsrx against 65 KB without its recorded Replay (6
  arms, 21 KB of frame data); Markdown is 29 KB against 22 KB; Show more adds 3 KB.
- Site parts: the docs outline (`useActiveItem`) starts with no link active. The capture's own scroll to the bottom
  left the last heading's link marked in the markup, so it changed colour during unrelated steps (`extra motion of
  link "RTL"`, 16 to 18 routes). View Code sets `data-mobile-code-visible` on its code block, as
  ComponentPreviewTabs does, which shows the block's Copy button (`click button "View Code"`, 46 routes); a click
  on a control that swaps its container's content now still reaches the parts.
- Parts: @shadcn/react Questionnaire (`parts/shadcn/questionnaire.ts`). Every item, error and navigation button is in
  the markup, so the port writes back the attributes the library derives: the active item, answers, skips,
  validation, progress, and keyboard shortcuts. A progress renderer of `{ current, total }` follows too. Held to the
  real library by `test/questionnaire-port.test.ts`: each demo form is driven through the same 15 steps the library
  was driven through on the old site (`test/ports/questionnaire-oracle.json`). Attributes, live properties and
  focus must match after every step. The one exception is two demos whose own React state takes over at a known
  step. Reset shows the old page's toast (`notify`). Before: Next, Previous, Skip, Submit and the shortcuts did
  nothing on all 26 questionnaire demos. After: 13 of 14 base demos work in the local witness.
- Ported route handlers carry the old build's `NEXT_PUBLIC_*` values inlined, as `next build` does. A value naming
  the old origin becomes the new app's (`import.meta.env.VITE_APP_URL`). `/init/v0` had answered 500 on the live
  port (`Failed to parse URL from undefined/r/...`); it is now byte for byte the old answer. Nitro's tracer no longer
  parses TypeScript's 9 MB bundle under ts-morph (`/init/v0` needs ts-morph at run time). Nitro's `pkg*` form alone
  saved nothing, because nf3 adds the whole package only after `@vercel/nft` has parsed it. The `nitro:externals`
  pass went from 4.3 to 11.8 s to 2.9 to 3.2 s on the 25-route build (#48).
- The live preview's Vercel projects (`mm-shadcn-ui-new`, `mm-shadcn-ui-old`) have a system bypass rule for the
  checking machine's address (97.99.124.50, `vercel firewall system-bypass`). Vercel's system mitigations had
  challenged the checker on the new deployment (403, `x-vercel-mitigated: challenge`) for 99 routes of the stopped
  check. The checker is unchanged. `--header x-vercel-protection-bypass` would also pass the challenge, but `check`
  then leaves out page-load measurement.
- `check`: a step counts as settled only when no animation with up to a second left is running, as for timeouts.
  The old page's region was gone once its 200 ms `accordion-up` ended, and its step settled later than the new
  page's (timeouts still due), so a closing accordion item read as not removed on the new side.
- input-otp (1.4.2) on Markless state (`OtpPlan`, `src/convert/otp.ts`; part `parts/input-otp.ts`): per field a
  state() for the value, the mirrored selection (`data-input-otp-mss`/`-mse`) and focus. Each slot binds
  `data-active` and shows its character, with the fake caret shadcn's slot renders in an `@if` arm; `convert` clears
  each field on the old page with the keyboard to capture that caret, then types into it to find app text that shows
  the value (the Controlled demo's "You entered: ..."), which follows the state too. The part runs the library's
  input, focus and `selectionchange` handling on the real input (pattern rejection undone, a single caret on a filled
  slot selects it, an unfocused field drops its mirror) and its password-manager badge widening. Witness on
  radix, base and aria `input-otp`: 9 works and Disabled static on each (7 broken before on radix and base); the
  a11y tree of the demos matches. A slot shows a typed character 1 to 2 ms after the key against the old page's
  under 1 ms, within the same frame.
- `convert`: text in an element styled to keep its newlines (`whitespace-pre*`, `white-space: pre*`, or inside one)
  is copied as it is. It used to be collapsed as in normal flow, so a chat bubble's numbered reply
  (`whitespace-pre-wrap`) ran onto one line: 114 px tall on the port against 159 px on the old page, and the
  transcript around it opened 45 px short.
- react-day-picker (9.8) calendars on Markless state (`DayPickerPlan`, `src/convert/day-picker.ts`; engine and part
  `parts/day-picker.ts`). `convert` reads each DayPicker from its React context on the old page (props, merged
  classNames, the date-fns locale's names and full date pattern, numerals, a Jalali DateLib) at the capture clock and
  at a second clock a year, four months and five days later, so a date that follows today (`useState(new Date())`,
  `disabled={(date) => date > new Date()}`, booked dates in the current year) is written relative to today; a function
  matcher is evaluated over 210 years into day spans. The port's first render on the capture clock is checked against
  the old page's markup before a calendar is ported (all 22 on `/docs/components/{radix,base}/calendar` pass). The page
  declares a `state()` view and a `computed()` model from the imported configuration (`lib/parts/day-picker-configs.ts`);
  the template is the old markup per part, with no branch and no handler in a row (months written once each, weeks and
  days keyed by place, a day's button always in its cell and hidden where DayPicker renders none), and the root's
  click, focusin, focusout, keydown and change run DayPicker's handlers: single, multiple and range selection, nav
  bounds and the month and year dropdowns, the keyboard grid (arrows, Page Up/Down, Shift, Home/End, RTL) skipping
  disabled days, and the focus target and last-focused rules. Also measured on the old page and followed: whether a
  day button focuses itself (shadcn's Radix CalendarDayButton does; the Base UI one never gets its ref), whether the
  demo's wrapper mounts the calendar again when the selection or month changes (shadcn passes new `components` on each
  render: the focus leaves the calendar and the next Tab starts at it), and buttons beside a calendar that set it (the
  Presets row: today plus N days, and that day's month). A dropdown's `selected` attribute stays where the server
  wrote it, as React's does. Compared step by step with the old page (navigation, clicks, eight keys, Enter, a second
  day, Tab away, both dropdowns): all 22 calendars match at every step, and so do their accessibility trees, after
  the first render, where the old page still shows the day it was built as today until something renders again.
  Markless rebuilding a cell moves the focus onto its new node; React removes it, so that focus is not DayPicker's.

## Markless framework bugs found

Fixed in Markless 0.8.0: 1 (a 12,000-element static page now builds in 0.57 GB, was 2.54 GB), 2 (a handler in
`document.tsrx` is a build error, MARKLESS_ROUTER_DOCUMENT_HANDLERS_UNSUPPORTED), 4, 5 and 6, and the `@if` arm text
parse (quotes and backticks in arm text).

1. Build memory and shipped JavaScript grew with static element count (a host record per static element). Fixed.
2. Event handlers in `document.tsrx` were dropped without a diagnostic. Now a build error.
3. Resume locator errors: the first ports' DOM writes (fixed in the pipeline, guarded by `test/parts-guard.test.ts`)
   and bug 5.
4. `attach={(el) => watch(el)}` with an imported `watch` stopped the build. Fixed.
5. A `<template>` with element children broke every later handler of the page. Fixed.
6. Captured content could not sit in an `@if` arm. Fixed.
7. A component-body `const` read by an attribute inside an `@if` arm stops the build, though a module constant or a
   prop in the same place compiles:
   ```tsrx
   export default function Child() @{
   	const id = 'x';
   	let open = state(false);
   	<div>
   		<button onClick={() => (open = !open)}>toggle</button>
   		@if (open) { <><p id={id}>shown</p></> }
   	</div>
   }
   ```
   MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED "holds an attribute binding". With `const ID = 'x'` at module level, or
   `id={path}` from a prop, it builds. The converter keeps such arms rendered and hidden (a shared component reads
   its per-page values through a body `const values = VALUES[path]`).
8. A page's root cannot be a fragment holding components (MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED), yet the same
   components inside `@if` arms of a fragment root build and resume correctly:
   `<>@if (SHOWN) { <main><Child /></main> }@if (SHOWN) { <><Layer /></> }</>` with `const SHOWN = true` at module
   level. The converter uses that form to render a page's own layers beside its root.
9. Build memory grows with page count: a synthetic app of pages that each use 20 of 200 stateful components peaks
   at 2.07 GB with 50 pages and 3.69 GB with 200 (about 11 MB a page; generator in the PR). ui.shadcn.com's 498
   pages peak at 15 to 19 GB and exceed Node's default 4 GB heap (`JavaScript heap out of memory` while rendering
   chunks), so the build needs `--max-old-space-size`.
10. Server code in one module can grow past what V8 compiles: with all 1,914 layers imported by the Document, the
    server's 78 MB chunk (render data, about 40 KB a layer) crashed Node 24 on arm64 in Maglev
    (`Check failed: is_int26(x)`); `node --no-maglev` serves it. Splitting the layers per page avoids it.

11. A page whose root is a bare `@switch` builds without a diagnostic and then answers every request with
    "Page module must export a Markless compiled artifact":
    ```tsrx
    export default function Page({ url }: PageProps) @{
    	const search = url.search;
    	@switch (search) {
    		@case "?a": { <main><p>a</p></main> }
    		@default: { <main><p>d</p></main> }
    	}
    }
    ```
    The same switch inside `<>…</>` works. `/create` (14 query variants) and `/docs/directory` (48) rendered that
    message on the first full deploy; the converter now wraps the switch.
12. The build writes `interaction-closures.json` (in `.output/.markless/public`) as one `JSON.stringify` string listing
    every handler's module closure per route: handlers × the component's symbols, so a page with 400 handlers on a
    component of 2,000 symbols lists 600,000 module ids. ui.shadcn.com's was 462 MB; a few hundred more handlers
    passed V8's string limit and the build stopped with `RangeError: Invalid string length` in
    `interactionClosuresAsset`, after 49 minutes. The converter now puts a tab list's handlers on the list (one per
    event instead of one per trigger and event), which cut `/docs/cli`'s share from 39.6 to 26.5 MB.

13. Dynamic imports from one handler's code are packed into one chunk: `lib/parts/clipboard.ts` mapped each of 389
    paths to its own `() => import('./clipboard/N.ts')` (a few KB each), and the build emitted all 389 modules as one
    2.3 MB chunk, fetched by the first click of any page's Copy Page. Seen in the 0.9.0 build of this app (fb5840dd); not
    reduced to a minimal app yet. The converter no longer emits that shape. Minimal app: two pages whose button
    calls `copyFor(path)` from a module mapping 40 paths to `() => import('./texts/N.ts')`. On the 0.9.0 packs it
    builds one 249 KB chunk holding all 40 texts. The same module behind a plain `index.html` in a vite-plus build
    without Markless gives 40 chunks of about 6 KB.
14. A form's `onSubmit={(event) => event.preventDefault()}` is not resumed on `/docs/components/*/message-scroller`.
    The served form has no `m:on`, so its Send button submits the page natively and reloads it, on the live
    preview too. The same binding on the questionnaire page's forms is served as `m:on="submit:N!p"`, and a minimal
    app with that form nested under handlers resumes it. Not reduced further yet. The converter backs every handled
    form with a delegated `submit` part (`parts/form.ts`) that prevents it.

## Build memory on Markless 0.9.0 (2026-10-22)

All 498 pages, converted on markless-migrate main 6f528da, built and deployed one step at a time, each sampled alone
(`sample.mjs`: resident memory of the whole process tree once a second):

- Build (`NITRO_PRESET=vercel`, `VITE_APP_URL` set, `NODE_OPTIONS=--max-old-space-size=20000`): 27.5 GB (25.6 GiB)
  peak, nearly all of it one Node process, in 139 s. Compile results were kept from earlier builds under Vite's
  cacheDir (Markless #113), so this is a warm build. Memory climbs steadily over the whole build: 4.9 GB at 16 s,
  14 GB at 61 s, 24 GB at 106 s.
- Deploy (`vercel deploy --prebuilt --prod`, uploading 231 MB): 1.0 GB peak, 41 s.

The 23.1 GB reading from `/usr/bin/time` around `deploy.sh` was the build: the deploy step needs about 1 GB.

## Ecosystem CI

ui.shadcn.com is the `shadcn-ui` suite of compiled-run/markless-ecosystem-ci (#6 to #9 there). It covers 25 of the
498 pages, and 5 of them are in the per-PR sample.
- The suite's converted files are the release asset `shadcn-ui-suite-12207a0` of this repository: `convert.sh` with
  `ONLY=` the 25 routes, at 12207a0.
- The old site is this LOG's local Next.js build on `http://localhost:4000`. Recording builds it on the runner with
  `deploy/shadcn-ui/fetch-old.sh` and records it through the seal. Replays answer it from the capture.
- The record workflow's two replays agree on all three sample shards. Two checks are quarantined until 2026-11-05:
  an accordion frame on `/docs`, and `/docs/components/radix/dropdown-menu`'s desktop screenshots. The suite raises
  the checker's per-route timeout to 3000 s, because `/colors` and the dropdown-menu page each hit 1800 s in one of
  two replays.

## Status (2026-10-21)

Preview: https://mm-shadcn-ui-new.vercel.app serves all 498 HTML routes with Markless (no route falls through to
the old deployment: `--fallthrough` is not set and the crawl of every route finds a Markless page, no old-side
header), and every endpoint from the new app's own server code or its convert-time output.

Full build of the 498 pages on Markless 0.8.0 (56,288 modules): peak 15.3 to 22.2 GB resident across runs, 23 to 49
minutes (the Vercel-preset build and upload together), with `--max-old-space-size=20000`; Node's default 4 GB heap
runs out while rendering chunks. Convert: 3.0 to 3.5 GB, 2 to 7 minutes from the captures cache.

## Check of the live preview on Markless 0.9.0, after #39, #41, #42 (2026-10-23, in progress)

`check --all --concurrency 2` of https://mm-shadcn-ui-new.vercel.app, built from markless-migrate main 6f528da on
the Markless fb5840dd packs, against the old site served locally. It started at 22:17 on 2026-10-22, with nothing
challenged by Vercel since the bypass rule. At 09:25 on 2026-10-23 it had checked 530 of 1,031 routes; it keeps
running, and `check --resume` carries it on.

- **Now:** 305 green, 223 red, 2 not checked (a route stopped by the 1800 s
  timeout). Here a route is red only for failures no automatic rule covers, because the run has not reached the
  checker's acceptance pass.
- **The same 530 routes in the complete run before** (Markless fbbb80634): 292 green, 231 red, 7 not checked.
- **Changes:** 17 routes went from red to green and 5 from green to red. The 5 are small computed-style differences:
  `/charts/radial` and `/charts/bar` (an iframe's style), `/docs/components/radix/command` and
  `/docs/components/aria/item` (a link's style), and `/docs/components/aria/aspect-ratio`.
- `/docs/directory?page=N` serves each page's own list now (#36 is on this deployment).

Leading causes (routes):

| Routes | Cause |
|---:|---|
| 98 | behaviour: not exercised: link "…" |
| 95 | behaviour: not exercised: clickable <div> (no name: matched by structure and position) |
| 94 | behaviour: click button "…" |
| 88 | behaviour: not exercised: tab "…" |
| 76 | behaviour: not exercised: button "…" (after click button "…") |
| 75 | behaviour: click button |
| 70 | behaviour: not exercised: menuitem "…" (after click button) |
| 63 | behaviour: not exercised: combobox |
| 50 | behaviour: not exercised: button "…" |
| 42 | css: computed style of generic |
| 38 | behaviour: not exercised: link "…" (after click button "…") |
| 36 | behaviour: not exercised: clickable "…" (after click button "…") |
| 34 | css: computed style of g |
| 31 | rendered: accessibility tree |
| 28 | css: computed style of path |

<details><summary>Every route checked so far</summary>

| Route | Result | Leading causes |
|---|---|---|
| `/` | red | behaviour: not exercised: menuitem "…" (after click button "…") (6); motion: click clickable <div> in main>group>group (no name: matched by structure and pos (4); behaviour: click button "…" (2) |
| `/blocks` | red | behaviour: not exercised: button "…" (after click tab "…") (18); responsiveness: first interaction with button "…" (desktop) (6); behaviour: click tab "…" (5) |
| `/blocks/authentication` | red | behaviour: not exercised: radio "…" (30); behaviour: not exercised: tab "…" (20); behaviour: not exercised: clickable <div> in main (no name: matched by structure and positi (10) |
| `/blocks/dashboard` | green |  |
| `/blocks/login` | green |  |
| `/blocks/sidebar` | green |  |
| `/blocks/signup` | green |  |
| `/charts` | not checked | timeout |
| `/charts/area` | not checked | timeout |
| `/charts/bar` | red | css: computed style of iframe "…" (2) |
| `/charts/line` | green |  |
| `/charts/pie` | red | css: computed style of iframe "…" (6) |
| `/charts/radar` | red | css: computed style of iframe "…" (2) |
| `/charts/radial` | red | css: computed style of iframe "…" (6) |
| `/charts/tooltip` | green |  |
| `/cli` | red | behaviour: not exercised: link "…" (128); behaviour: not exercised: tab "…" (128); behaviour: click button "…" (6) |
| `/colors` | red | behaviour: not exercised: button "…" (280); behaviour: not exercised: combobox (26); behaviour: not exercised: button (5) |
| `/components` | red | behaviour: not exercised: link "…" (67); behaviour: click button (1); behaviour: not exercised: clickable <div> (no name: matched by structure and position) (1) |
| `/create` | red | behaviour: not exercised: option "…" (after click button "…", then click button "…") (449); behaviour: not exercised: menuitemradio "…" (after click button "…", then click button "…") (74); behaviour: click button "…", then click button "…" (step 1) (30) |
| `/create?base=aria` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 1 (1) |
| `/create?preset=b27GcrRo` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 2 (1) |
| `/create?preset=b2D0wqNxT` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 1 (1) |
| `/create?preset=b4xFeBLg4O` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 1 (1) |
| `/create?template=astro` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 1 (1) |
| `/create?template=laravel` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 1 (1) |
| `/create?template=next` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 1 (1) |
| `/create?template=next&base=base&rtl=true` | red | rendered: accessibility tree (8); rendered: visible text (4); a11y: landmarks (2) |
| `/create?template=react-router` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 1 (1) |
| `/create?template=start` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 2 (1) |
| `/create?template=start&base=base&rtl=true` | red | rendered: accessibility tree (8); rendered: visible text (4); a11y: landmarks (2) |
| `/create?template=vite` | red | css: computed style of button "…" (dialog>button/button) (1); a11y: focus order (Tab), first difference at stop 2 (1) |
| `/create?template=vite&base=base&rtl=true` | red | rendered: accessibility tree (8); rendered: visible text (4); a11y: landmarks (2) |
| `/docs` | red | behaviour: click button, then click menuitem "…" (step 1) (5); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click button (1) |
| `/docs/_blocks` | red | behaviour: not exercised: link "…" (36); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click link "…" (2) |
| `/docs/_v0` | green |  |
| `/docs/ai-elements` | red | behaviour: not exercised: link "…" (120); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: not exercised: tab "…" (4) |
| `/docs/ai-elements/aria/chain-of-thought` | red | behaviour: not exercised: link "…" (17); behaviour: not exercised: tab "…" (6); behaviour: click button "…" (2) |
| `/docs/ai-elements/aria/chat` | red | behaviour: not exercised: link "…" (126); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/ai-elements/aria/checkpoint` | red | behaviour: not exercised: link "…" (30); behaviour: click link "…" (8); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/aria/confirmation` | green |  |
| `/docs/ai-elements/aria/context` | green |  |
| `/docs/ai-elements/aria/file-tree` | green |  |
| `/docs/ai-elements/aria/inline-citation` | green |  |
| `/docs/ai-elements/aria/message` | red | behaviour: not exercised: link "…" (138); behaviour: not exercised: button "…" (16); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/aria/model-selector` | green |  |
| `/docs/ai-elements/aria/plan` | red | behaviour: not exercised: link "…" (32); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/ai-elements/aria/prompt-input` | green |  |
| `/docs/ai-elements/aria/queue` | green |  |
| `/docs/ai-elements/aria/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/ai-elements/aria/sources` | green |  |
| `/docs/ai-elements/aria/stack-trace` | green |  |
| `/docs/ai-elements/aria/subagent` | green |  |
| `/docs/ai-elements/aria/suggestion` | green |  |
| `/docs/ai-elements/aria/task` | green |  |
| `/docs/ai-elements/aria/terminal` | green |  |
| `/docs/ai-elements/aria/test-results` | green |  |
| `/docs/ai-elements/aria/tool` | green |  |
| `/docs/ai-elements/base/chain-of-thought` | green |  |
| `/docs/ai-elements/base/chat` | red | behaviour: not exercised: link "…" (42); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/ai-elements/base/checkpoint` | green |  |
| `/docs/ai-elements/base/confirmation` | green |  |
| `/docs/ai-elements/base/context` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/ai-elements/base/file-tree` | red | behaviour: click button, then click menuitem "…" (step 1) (5); behaviour: click tab "…" (3); motion: click button "…": motion of button "…" (3) |
| `/docs/ai-elements/base/inline-citation` | green |  |
| `/docs/ai-elements/base/message` | red | behaviour: not exercised: link "…" (91); behaviour: click button "…" (8); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/base/model-selector` | green |  |
| `/docs/ai-elements/base/plan` | green |  |
| `/docs/ai-elements/base/prompt-input` | green |  |
| `/docs/ai-elements/base/queue` | green |  |
| `/docs/ai-elements/base/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/ai-elements/base/sources` | green |  |
| `/docs/ai-elements/base/stack-trace` | green |  |
| `/docs/ai-elements/base/subagent` | green |  |
| `/docs/ai-elements/base/suggestion` | green |  |
| `/docs/ai-elements/base/task` | green |  |
| `/docs/ai-elements/base/terminal` | green |  |
| `/docs/ai-elements/base/test-results` | green |  |
| `/docs/ai-elements/base/tool` | green |  |
| `/docs/ai-elements/radix/chain-of-thought` | green |  |
| `/docs/ai-elements/radix/chat` | green |  |
| `/docs/ai-elements/radix/checkpoint` | green |  |
| `/docs/ai-elements/radix/confirmation` | green |  |
| `/docs/ai-elements/radix/context` | green |  |
| `/docs/ai-elements/radix/file-tree` | green |  |
| `/docs/ai-elements/radix/inline-citation` | green |  |
| `/docs/ai-elements/radix/message` | green |  |
| `/docs/ai-elements/radix/model-selector` | green |  |
| `/docs/ai-elements/radix/plan` | green |  |
| `/docs/ai-elements/radix/prompt-input` | green |  |
| `/docs/ai-elements/radix/queue` | green |  |
| `/docs/ai-elements/radix/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/ai-elements/radix/sources` | green |  |
| `/docs/ai-elements/radix/stack-trace` | green |  |
| `/docs/ai-elements/radix/subagent` | green |  |
| `/docs/ai-elements/radix/suggestion` | green |  |
| `/docs/ai-elements/radix/task` | green |  |
| `/docs/ai-elements/radix/terminal` | green |  |
| `/docs/ai-elements/radix/test-results` | green |  |
| `/docs/ai-elements/radix/tool` | green |  |
| `/docs/ai-sdk-ui/chatbot-tool-usage` | red | rendered: accessibility tree (4); a11y: landmarks (2); behaviour: not exercised: clickable <div> (no name: matched by structure and position) (1) |
| `/docs/blocks` | red | rendered: accessibility tree (2); a11y: landmarks (2) |
| `/docs/changelog` | red | behaviour: not exercised: link "…" (199); behaviour: not exercised: tab "…" (36); behaviour: not exercised: button "…" (35) |
| `/docs/changelog/2023-06-new-cli` | red | behaviour: not exercised: link "…" (136); behaviour: not exercised: button "…" (21); behaviour: not exercised: tab "…" (20) |
| `/docs/changelog/2023-07-javascript` | green |  |
| `/docs/changelog/2023-12-new-components` | red | behaviour: not exercised: link "…" (45); behaviour: not exercised: clickable <g> in dialog>application (no name: matched by structur (13); behaviour: not exercised: button "…" (after click button "…") (6) |
| `/docs/changelog/2024-03-blocks` | green |  |
| `/docs/changelog/2024-03-breadcrumb-otp` | red | behaviour: not exercised: link "…" (14); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: not exercised: menuitem "…" (after click button "…") (3) |
| `/docs/changelog/2024-04-lift-mode` | green |  |
| `/docs/changelog/2024-08-npx-shadcn-init` | green |  |
| `/docs/changelog/2024-10-react-19` | green |  |
| `/docs/changelog/2024-10-sidebar` | green |  |
| `/docs/changelog/2024-11-icons` | green |  |
| `/docs/changelog/2024-12-monorepo` | green |  |
| `/docs/changelog/2025-01-blocks` | green |  |
| `/docs/changelog/2025-02-registry-schema` | green |  |
| `/docs/changelog/2025-02-tailwind-v4` | green |  |
| `/docs/changelog/2025-04-cross-framework` | green |  |
| `/docs/changelog/2025-04-mcp` | green |  |
| `/docs/changelog/2025-04-shadcn-2-5` | green |  |
| `/docs/changelog/2025-05-new-site` | green |  |
| `/docs/changelog/2025-06-calendar` | green |  |
| `/docs/changelog/2025-06-radix-ui` | green |  |
| `/docs/changelog/2025-07-local-file-support` | green |  |
| `/docs/changelog/2025-07-universal-registry` | green |  |
| `/docs/changelog/2025-08-cli-3-mcp` | green |  |
| `/docs/changelog/2025-09-registry-index` | green |  |
| `/docs/changelog/2025-10-new-components` | red | behaviour: not exercised: link "…" (137); behaviour: not exercised: button "…" (64); behaviour: not exercised: textbox "…" (11) |
| `/docs/changelog/2025-10-registry-directory` | green |  |
| `/docs/changelog/2025-12-shadcn-create` | green |  |
| `/docs/changelog/2026-01-base-ui` | green |  |
| `/docs/changelog/2026-01-inline-side-styles` | green |  |
| `/docs/changelog/2026-01-rtl` | red | behaviour: not exercised: link "…" (138); behaviour: not exercised: button "…" (12); behaviour: not exercised: tab "…" (11) |
| `/docs/changelog/2026-02-blocks` | green |  |
| `/docs/changelog/2026-02-radix-ui` | green |  |
| `/docs/changelog/2026-03-cli-v4` | green |  |
| `/docs/changelog/2026-03-luma` | green |  |
| `/docs/changelog/2026-04-component-composition` | green |  |
| `/docs/changelog/2026-04-partial-preset-apply` | green |  |
| `/docs/changelog/2026-04-pointer-cursor` | green |  |
| `/docs/changelog/2026-04-preset-commands` | green |  |
| `/docs/changelog/2026-04-sera` | green |  |
| `/docs/changelog/2026-04-shadcn-apply` | green |  |
| `/docs/changelog/2026-05-package-imports-target-aliases` | green |  |
| `/docs/changelog/2026-05-registry-include` | green |  |
| `/docs/changelog/2026-05-rhea` | green |  |
| `/docs/changelog/2026-05-shadcn-eject` | green |  |
| `/docs/changelog/2026-06-chat-components` | green |  |
| `/docs/changelog/2026-06-github-registries` | green |  |
| `/docs/changelog/2026-07-base-ui-default` | green |  |
| `/docs/changelog/2026-07-dynamic-search` | green |  |
| `/docs/changelog/2026-07-helpers` | green |  |
| `/docs/changelog/2026-07-react-aria` | green |  |
| `/docs/changelog/2026-07-toast` | green |  |
| `/docs/changelog/2026-07-typeset` | green |  |
| `/docs/changelog/2026-08-helpers-human-in-the-loop` | green |  |
| `/docs/changelog/2026-08-private-github-registries` | green |  |
| `/docs/changelog/2026-08-questionnaire` | red | behaviour: not exercised: link "…" (46); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: not exercised: tab "…" (4) |
| `/docs/changelog/2026-09-cn` | green |  |
| `/docs/changelog/2026-10-ai-elements` | red | behaviour: not exercised: link "…" (140); behaviour: not exercised: tab "…" (8); behaviour: not exercised: button "…" (5) |
| `/docs/cli` | green |  |
| `/docs/components` | green |  |
| `/docs/components-json` | green |  |
| `/docs/components/aria/accordion` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: button "…" (11); behaviour: click button "…" (10) |
| `/docs/components/aria/alert` | red | behaviour: not exercised: link "…" (128); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/aria/alert-dialog` | green |  |
| `/docs/components/aria/aspect-ratio` | red | css: computed style of generic (1) |
| `/docs/components/aria/attachment` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/aria/avatar` | green |  |
| `/docs/components/aria/badge` | green |  |
| `/docs/components/aria/breadcrumb` | red | behaviour: not exercised: link "…" (135); behaviour: not exercised: tab "…" (6); behaviour: click button "…" (5) |
| `/docs/components/aria/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/components/aria/button` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (14); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/button-group` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: button "…" (27); behaviour: not exercised: menuitem "…" (after click button "…") (7) |
| `/docs/components/aria/calendar` | red | behaviour: not exercised: button "…" (351); behaviour: not exercised: link "…" (145); behaviour: not exercised: row "…" (22) |
| `/docs/components/aria/card` | red | behaviour: not exercised: link "…" (143); behaviour: not exercised: button "…" (13); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/carousel` | red | behaviour: not exercised: link "…" (144); behaviour: click button "…" (7); behaviour: not exercised: button "…" (7) |
| `/docs/components/aria/chart` | red | css: computed style of g (3) |
| `/docs/components/aria/checkbox` | green |  |
| `/docs/components/aria/code-block` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (55); behaviour: not exercised: tab "…" (9) |
| `/docs/components/aria/collapsible` | red | behaviour: not exercised: button "…" (after click button "…") (16); behaviour: click button "…" (9); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/aria/combobox` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: button "…" (24); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/command` | red | behaviour: not exercised: link "…" (125); behaviour: not exercised: menuitem "…" (after click button "…") (23); behaviour: not exercised: menuitem "…" (10) |
| `/docs/components/aria/context-menu` | red | behaviour: not exercised: link "…" (142); behaviour: not exercised: button "…" (24); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/data-table` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (45); rendered: accessibility tree (34) |
| `/docs/components/aria/date-picker` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (after click button "…") (36); behaviour: not exercised: button "…" (17) |
| `/docs/components/aria/dialog` | green |  |
| `/docs/components/aria/direction` | green |  |
| `/docs/components/aria/drawer` | red | behaviour: not exercised: link "…" (80); behaviour: click button "…" (9); behaviour: not exercised: button "…" (after click button "…") (7) |
| `/docs/components/aria/dropdown-menu` | green |  |
| `/docs/components/aria/empty` | green |  |
| `/docs/components/aria/field` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (35); behaviour: not exercised: option "…" (after click button "…") (30) |
| `/docs/components/aria/hover-card` | green |  |
| `/docs/components/aria/input` | red | behaviour: not exercised: link "…" (101); behaviour: not exercised: tab "…" (6); behaviour: click button "…" (5) |
| `/docs/components/aria/input-group` | green |  |
| `/docs/components/aria/input-otp` | green |  |
| `/docs/components/aria/item` | red | css: computed style of link "…" (2) |
| `/docs/components/aria/kbd` | green |  |
| `/docs/components/aria/label` | green |  |
| `/docs/components/aria/marker` | green |  |
| `/docs/components/aria/message` | red | behaviour: not exercised: link "…" (57); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/aria/message-scroller` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (52); css: computed style of region "…" (12) |
| `/docs/components/aria/native-select` | red | behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: not exercised: tab "…" (4); behaviour: not exercised: option "…" (after click combobox) (3) |
| `/docs/components/aria/pagination` | red | behaviour: not exercised: link "…" (30); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/aria/popover` | green |  |
| `/docs/components/aria/progress` | green |  |
| `/docs/components/aria/questionnaire` | red | http: the check of this route (1) |
| `/docs/components/aria/radio-group` | red | behaviour: not exercised: link "…" (20); behaviour: not exercised: tab "…" (6); behaviour: click button "…" (4) |
| `/docs/components/aria/resizable` | green |  |
| `/docs/components/aria/scroll-area` | green |  |
| `/docs/components/aria/select` | red | behaviour: not exercised: link "…" (101); behaviour: not exercised: option "…" (after click button "…") (62); behaviour: not exercised: clickable "…" (after click button "…") (10) |
| `/docs/components/aria/separator` | green |  |
| `/docs/components/aria/sheet` | green |  |
| `/docs/components/aria/sidebar` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/aria/skeleton` | green |  |
| `/docs/components/aria/slider` | red | css: computed style of group "…" (5); css: computed style of generic (3) |
| `/docs/components/aria/sonner` | green |  |
| `/docs/components/aria/spinner` | green |  |
| `/docs/components/aria/switch` | red | behaviour: not exercised: link "…" (88); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/aria/table` | green |  |
| `/docs/components/aria/tabs` | green |  |
| `/docs/components/aria/textarea` | green |  |
| `/docs/components/aria/toast` | green |  |
| `/docs/components/aria/toggle` | green |  |
| `/docs/components/aria/toggle-group` | red | behaviour: not exercised: link "…" (39); behaviour: not exercised: radio "…" (21); behaviour: click button "…" (8) |
| `/docs/components/aria/tooltip` | green |  |
| `/docs/components/aria/trace` | red | behaviour: not exercised: link "…" (140); behaviour: not exercised: button "…" (51); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/typography` | red | behaviour: not exercised: link "…" (102); behaviour: click button (1); behaviour: not exercised: button "…" (1) |
| `/docs/components/attachment` | green |  |
| `/docs/components/base/accordion` | red | behaviour: not exercised: link "…" (131); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/base/alert` | green |  |
| `/docs/components/base/alert-dialog` | red | behaviour: not exercised: link "…" (78); behaviour: click button "…" (14); behaviour: not exercised: button "…" (after click button "…") (10) |
| `/docs/components/base/aspect-ratio` | green |  |
| `/docs/components/base/attachment` | green |  |
| `/docs/components/base/avatar` | green |  |
| `/docs/components/base/badge` | green |  |
| `/docs/components/base/breadcrumb` | red | behaviour: not exercised: link "…" (138); behaviour: click button "…" (6); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/bubble` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: button "…" (11); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/button` | green |  |
| `/docs/components/base/button-group` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (20); behaviour: not exercised: menuitem "…" (after click button "…") (7) |
| `/docs/components/base/calendar` | red | behaviour: not exercised: button "…" (458); behaviour: not exercised: link "…" (146); behaviour: not exercised: row "…" (24) |
| `/docs/components/base/card` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: button "…" (17); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/carousel` | red | css: computed style of generic (3) |
| `/docs/components/base/chart` | red | css: computed style of g (3) |
| `/docs/components/base/checkbox` | red | behaviour: not exercised: link "…" (87); behaviour: not exercised: checkbox "…" (13); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/code-block` | green |  |
| `/docs/components/base/collapsible` | red | behaviour: not exercised: link "…" (49); behaviour: not exercised: button "…" (after click button "…") (16); behaviour: not exercised: tab "…" (8) |
| `/docs/components/base/combobox` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: option "…" (after click combobox "…") (48); behaviour: not exercised: button "…" (14) |
| `/docs/components/base/command` | red | behaviour: not exercised: link "…" (21); behaviour: not exercised: option "…" (after click button "…") (18); behaviour: not exercised: option "…" (10) |
| `/docs/components/base/context-menu` | red | behaviour: not exercised: link "…" (128); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/base/data-table` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: button "…" (39); rendered: accessibility tree (34) |
| `/docs/components/base/date-picker` | green |  |
| `/docs/components/base/dialog` | green |  |
| `/docs/components/base/direction` | green |  |
| `/docs/components/base/drawer` | green |  |
| `/docs/components/base/dropdown-menu` | green |  |
| `/docs/components/base/empty` | green |  |
| `/docs/components/base/field` | red | behaviour: not exercised: link "…" (143); behaviour: not exercised: button "…" (39); behaviour: not exercised: textbox "…" (15) |
| `/docs/components/base/hover-card` | red | behaviour: not exercised: link "…" (54); behaviour: click button "…" (9); behaviour: not exercised: clickable "…" (after click button "…") (7) |
| `/docs/components/base/input` | green |  |
| `/docs/components/base/input-group` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (36); behaviour: not exercised: clickable "…" (15) |
| `/docs/components/base/input-otp` | red | css: computed style of generic (2); css: computed style of group (1) |
| `/docs/components/base/item` | green |  |
| `/docs/components/base/kbd` | green |  |
| `/docs/components/base/label` | red | behaviour: not exercised: option "…" (after click combobox "…") (20); behaviour: not exercised: link "…" (11); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/marker` | green |  |
| `/docs/components/base/menubar` | red | behaviour: not exercised: link "…" (64); behaviour: not exercised: menuitem "…" (16); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/message` | green |  |
| `/docs/components/base/message-scroller` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: button "…" (53); css: computed style of region "…" (12) |
| `/docs/components/base/native-select` | green |  |
| `/docs/components/base/navigation-menu` | red | behaviour: not exercised: link "…" (56); behaviour: not exercised: link "…" (after click button "…") (24); behaviour: click button "…" (9) |
| `/docs/components/base/pagination` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/base/popover` | green |  |
| `/docs/components/base/progress` | green |  |
| `/docs/components/base/questionnaire` | red | css: computed style of generic (1) |
| `/docs/components/base/radio-group` | red | behaviour: not exercised: radio "…" (20); behaviour: not exercised: link "…" (8); behaviour: click button "…" (7) |
| `/docs/components/base/resizable` | green |  |
| `/docs/components/base/scroll-area` | red | css: computed style of generic (1) |
| `/docs/components/base/select` | red | behaviour: not exercised: link "…" (68); behaviour: not exercised: combobox (7); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/separator` | green |  |
| `/docs/components/base/sheet` | red | behaviour: not exercised: link "…" (59); behaviour: click button "…" (11); behaviour: not exercised: button "…" (after click button "…") (7) |
| `/docs/components/base/sidebar` | green |  |
| `/docs/components/base/skeleton` | green |  |
| `/docs/components/base/slider` | red | css: computed style of group (3); css: computed style of generic (1) |
| `/docs/components/base/spinner` | green |  |
| `/docs/components/base/switch` | green |  |
| `/docs/components/base/table` | green |  |
| `/docs/components/base/tabs` | green |  |
| `/docs/components/base/textarea` | green |  |
| `/docs/components/base/toast` | green |  |
| `/docs/components/base/toggle` | green |  |
| `/docs/components/base/toggle-group` | red | rendered: accessibility tree (1); css: computed style of button "…" (1) |
| `/docs/components/base/tooltip` | red | behaviour: not exercised: link "…" (143); behaviour: click button "…" (9); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/trace` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (45); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/typography` | green |  |
| `/docs/components/breadcrumb` | green |  |
| `/docs/components/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/components/button` | green |  |
| `/docs/components/button-group` | green |  |
| `/docs/components/calendar` | red | rendered: accessibility tree (10) |
| `/docs/components/chart` | red | css: computed style of g (3) |
| `/docs/components/collapsible` | green |  |
| `/docs/components/data-table` | red | rendered: accessibility tree (17); css: computed style of generic (5); css: computed style of generic "…" (3) |
| `/docs/components/input-group` | green |  |
| `/docs/components/input-otp` | red | css: computed style of generic (2); css: computed style of group (1) |
| `/docs/components/marker` | green |  |
| `/docs/components/message` | green |  |
| `/docs/components/message-scroller` | red | css: computed style of region "…" (6); css: computed style of generic (1) |
| `/docs/components/popover` | green |  |
| `/docs/components/radix/accordion` | green |  |
| `/docs/components/radix/alert` | green |  |
| `/docs/components/radix/alert-dialog` | green |  |
| `/docs/components/radix/aspect-ratio` | green |  |
| `/docs/components/radix/attachment` | green |  |
| `/docs/components/radix/avatar` | red | rendered: accessibility tree (20); rendered: visible text (20); assets: image https://github.com/shadcn.png (13) |
| `/docs/components/radix/badge` | green |  |
| `/docs/components/radix/breadcrumb` | green |  |
| `/docs/components/radix/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/components/radix/button` | green |  |
| `/docs/components/radix/button-group` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: button "…" (40); behaviour: not exercised: button (9) |
| `/docs/components/radix/calendar` | red | rendered: accessibility tree (10) |
| `/docs/components/radix/card` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (11); behaviour: not exercised: tab "…" (6) |
| `/docs/components/radix/carousel` | red | css: computed style of generic (3); rendered: accessibility tree (1); css: computed style of button "…" (1) |
| `/docs/components/radix/chart` | red | css: computed style of g (3) |
| `/docs/components/radix/checkbox` | red | rendered: accessibility tree (2); css: computed style of checkbox (1) |
| `/docs/components/radix/code-block` | green |  |
| `/docs/components/radix/collapsible` | green |  |
| `/docs/components/radix/combobox` | green |  |
| `/docs/components/radix/command` | red | css: computed style of link "…" (1) |
| `/docs/components/radix/context-menu` | red | behaviour: not exercised: link "…" (27); behaviour: not exercised: clickable "…" (10); behaviour: not exercised: tab "…" (6) |
| `/docs/components/radix/data-table` | red | rendered: accessibility tree (17); css: computed style of generic (5); css: computed style of generic "…" (3) |
| `/docs/components/radix/date-picker` | green |  |
| `/docs/components/radix/dialog` | green |  |
| `/docs/components/radix/direction` | green |  |
| `/docs/components/radix/drawer` | red | behaviour: not exercised: link "…" (97); behaviour: not exercised: clickable <g> in dialog>application (no name: matched by structur (14); behaviour: click button "…" (12) |
| `/docs/components/radix/dropdown-menu` | red | rendered: accessibility tree (2); rendered: visible text (1); a11y: axe color-contrast: Elements must meet minimum color contrast ratio thresholds (1) |
| `/docs/components/radix/empty` | red | rendered: accessibility tree (6); rendered: visible text (4); assets: image https://github.com/shadcn.png (2) |
| `/docs/components/radix/field` | red | behaviour: not exercised: link "…" (147); behaviour: not exercised: button "…" (34); behaviour: not exercised: option "…" (after click combobox "…") (32) |
| `/docs/components/radix/hover-card` | green |  |
| `/docs/components/radix/input` | red | behaviour: not exercised: link "…" (147); behaviour: not exercised: button "…" (23); behaviour: not exercised: tab "…" (6) |
| `/docs/components/radix/input-group` | green |  |
| `/docs/components/radix/input-otp` | red | css: computed style of generic (2); css: computed style of group (1) |
| `/docs/components/radix/item` | green |  |
| `/docs/components/radix/kbd` | green |  |
| `/docs/components/radix/label` | red | behaviour: not exercised: link "…" (34); behaviour: not exercised: option "…" (after click combobox "…") (18); behaviour: click link "…" (6) |
| `/docs/components/radix/marker` | green |  |
| `/docs/components/radix/menubar` | green |  |
| `/docs/components/radix/message` | green |  |
| `/docs/components/radix/message-scroller` | red | behaviour: not exercised: link "…" (147); behaviour: not exercised: button "…" (51); css: computed style of region "…" (12) |
| `/docs/components/radix/native-select` | green |  |
| `/docs/components/radix/navigation-menu` | green |  |
| `/docs/components/radix/pagination` | red | behaviour: not exercised: link "…" (52); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/radix/popover` | green |  |
| `/docs/components/radix/progress` | red | behaviour: not exercised: link "…" (91); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/radix/questionnaire` | red | css: computed style of generic (1) |
| `/docs/components/radix/radio-group` | green |  |
| `/docs/components/radix/resizable` | green |  |
| `/docs/components/radix/scroll-area` | green |  |
| `/docs/components/radix/select` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: button "…" (7); behaviour: not exercised: combobox (7) |
| `/docs/components/radix/separator` | green |  |
| `/docs/components/radix/sheet` | green |  |
| `/docs/components/radix/sidebar` | green |  |
| `/docs/components/radix/skeleton` | green |  |
| `/docs/components/radix/slider` | red | css: computed style of generic (8) |
| `/docs/components/radix/sonner` | green |  |
| `/docs/components/radix/spinner` | green |  |
| `/docs/components/radix/switch` | green |  |
| `/docs/components/radix/table` | green |  |
| `/docs/components/radix/tabs` | green |  |
| `/docs/components/radix/textarea` | green |  |
| `/docs/components/radix/toast` | green |  |
| `/docs/components/radix/toggle` | green |  |
| `/docs/components/radix/toggle-group` | red | behaviour: not exercised: link "…" (98); behaviour: not exercised: radio "…" (21); behaviour: click button "…" (6) |
| `/docs/components/radix/tooltip` | green |  |
| `/docs/components/radix/trace` | green |  |
| `/docs/components/radix/typography` | green |  |
| `/docs/components/scroll-area` | red | css: computed style of generic (1) |
| `/docs/components/select` | green |  |
| `/docs/components/spinner` | green |  |
| `/docs/components/tooltip` | green |  |
| `/docs/dark-mode` | green |  |
| `/docs/dark-mode/astro` | green |  |
| `/docs/dark-mode/next` | green |  |
| `/docs/dark-mode/remix` | green |  |
| `/docs/dark-mode/tanstack-start` | green |  |
| `/docs/dark-mode/vite` | green |  |
| `/docs/directory` | green |  |
| `/docs/directory?page=10` | green |  |
| `/docs/directory?page=11` | red | css: computed style of g (3); css: computed style of rect (1) |
| `/docs/directory?page=12` | red | css: computed style of rect (1) |
| `/docs/directory?page=13` | red | css: computed style of g (7); css: computed style of rect (2) |
| `/docs/directory?page=14` | red | css: computed style of g (2) |
| `/docs/directory?page=15` | red | css: computed style of g (1) |
| `/docs/directory?page=16` | green |  |
| `/docs/directory?page=17` | red | css: computed style of path (13); css: computed style of g (3); css: computed style of rect (1) |
| `/docs/directory?page=18` | red | css: computed style of path (1); css: computed style of g (1) |
| `/docs/directory?page=19` | red | css: computed style of g (4); css: computed style of path (1) |
| `/docs/directory?page=2` | red | css: computed style of g (2) |
| `/docs/directory?page=20` | red | css: computed style of g (1) |
| `/docs/directory?page=21` | red | css: computed style of path (13); css: computed style of polygon (6) |
| `/docs/directory?page=22` | green |  |
| `/docs/directory?page=23` | red | css: computed style of rect (2); css: computed style of g (1) |
| `/docs/directory?page=24` | red | css: computed style of g (9); css: computed style of path (2) |
| `/docs/directory?page=25` | red | css: computed style of path (16); css: computed style of path (banner>link/path) (2); css: computed style of path (banner>button/path) (1) |
| `/docs/directory?page=26` | red | css: computed style of rect (1); css: computed style of g (1); css: computed style of path (1) |
| `/docs/directory?page=27` | red | css: computed style of rect (3); css: computed style of path (1); css: computed style of g (1) |
| `/docs/directory?page=28` | green |  |
| `/docs/directory?page=29` | red | css: computed style of g (2) |
| `/docs/directory?page=3` | red | css: computed style of path (1) |
| `/docs/directory?page=30` | green |  |
| `/docs/directory?page=31` | red | css: computed style of g (2) |
| `/docs/directory?page=32` | green |  |
| `/docs/directory?page=33` | red | css: computed style of circle (1) |
| `/docs/directory?page=34` | red | css: computed style of path (3); css: computed style of g (1) |
| `/docs/directory?page=35` | red | css: computed style of g (1) |
| `/docs/directory?page=36` | green |  |
| `/docs/directory?page=37` | red | css: computed style of g (2) |
| `/docs/directory?page=38` | red | css: computed style of rect (2); css: computed style of g (2) |
| `/docs/directory?page=39` | red | css: computed style of g (1) |
| `/docs/directory?page=4` | green |  |
| `/docs/directory?page=40` | red | css: computed style of g (2); css: computed style of circle (1) |
| `/docs/directory?page=41` | red | css: computed style of path (2); css: computed style of g (1); css: computed style of rect (1) |
| `/docs/directory?page=42` | red | css: computed style of path (6); css: computed style of rect (1); css: computed style of circle (1) |
| `/docs/directory?page=43` | red | css: computed style of g (1) |
| `/docs/directory?page=44` | red | css: computed style of g (7); css: computed style of path (3) |
| `/docs/directory?page=45` | green |  |
| `/docs/directory?page=46` | red | css: computed style of path (1) |
| `/docs/directory?page=47` | red | css: computed style of g (1) |
| `/docs/directory?page=48` | green |  |
| `/docs/directory?page=5` | green |  |
| `/docs/directory?page=6` | red | css: computed style of circle (12); css: computed style of rect (1); css: computed style of path (1) |
| `/docs/directory?page=7` | red | css: computed style of path (6); css: computed style of g (3) |
| `/docs/directory?page=8` | green |  |
| `/docs/directory?page=9` | red | css: computed style of g (3); css: computed style of rect (1) |
| `/docs/figma` | green |  |
| `/docs/forms` | green |  |
| `/docs/forms/formisch` | red | behaviour: not exercised: link "…" (140); behaviour: not exercised: button "…" (54); rendered: accessibility tree (14) |
| `/docs/forms/next` | red | behaviour: not exercised: link "…" (141); rendered: accessibility tree (40); behaviour: not exercised: button "…" (31) |
| `/docs/forms/react-hook-form` | red | rendered: accessibility tree (7); css: computed style of generic "…" (2); css: computed style of checkbox (2) |
| `/docs/forms/tanstack-form` | red | rendered: accessibility tree (7); css: computed style of generic "…" (2); css: computed style of checkbox (2) |
| `/docs/helpers/ai-sdk` | red | behaviour: not exercised: link "…" (141); behaviour: not exercised: button "…" (35); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/helpers/tanstack-ai` | green |  |
| `/docs/installation` | green |  |
| `/docs/installation/astro` | green |  |
| `/docs/installation/gatsby` | green |  |
| `/docs/installation/laravel` | green |  |
| `/docs/installation/manual` | red | behaviour: not exercised: link "…" (88); rendered: visible text (20); rendered: accessibility tree (14) |
| `/docs/installation/next` | green |  |
| `/docs/installation/react-router` | green |  |
| `/docs/installation/remix` | green |  |
| `/docs/installation/tanstack` | green |  |
| `/docs/installation/tanstack-router` | green |  |
| `/docs/installation/vite` | green |  |
| `/docs/javascript` | green |  |
| `/docs/legacy` | green |  |
| `/docs/mcp` | green |  |
| `/docs/monorepo` | green |  |
| `/docs/new` | green |  |
| `/docs/official` | green |  |
| `/docs/package-imports` | green |  |
| `/docs/react-19` | red | behaviour: not exercised: link "…" (20); behaviour: click link "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/react/message-scroller` | green |  |
| `/docs/react/questionnaire` | red | http: the check of this route (1) |
| `/docs/registry` | green |  |
| `/docs/registry/api-reference` | green |  |
| `/docs/registry/authentication` | green |  |
| `/docs/registry/dynamic-search` | green |  |
| `/docs/registry/examples` | red | rendered: visible text (1) |
| `/docs/registry/faq` | green |  |
| `/docs/registry/getting-started` | red | behaviour: not exercised: link "…" (143); behaviour: not exercised: tab "…" (56); behaviour: not exercised: button "…" (14) |
| `/docs/registry/github` | green |  |
| `/docs/registry/health` | green |  |
| `/docs/registry/mcp` | green |  |
| `/docs/registry/namespace` | green |  |
| `/docs/registry/open-in-v0` | green |  |
| `/docs/registry/registry-index` | green |  |
| `/docs/registry/registry-item-json` | red | rendered: visible text (1) |
| `/docs/registry/registry-json` | green |  |
| `/docs/rtl` | green |  |
| `/docs/rtl/next` | green |  |
| `/docs/rtl/start` | green |  |
| `/docs/rtl/vite` | green |  |
| `/docs/skills` | green |  |
| `/docs/tailwind-v4` | green |  |
| `/docs/theming` | red | behaviour: not exercised: link "…" (108); rendered: accessibility tree (14); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/typeset` | green |  |
| `/docs/utils/scroll-fade` | green |  |
| `/docs/utils/shimmer` | green |  |
| `/examples/authentication` | red | behaviour: click combobox "…", then click option "…" (step 1) (8); motion: click button "…", then click tab "…": motion of tab "…" (dialog>tablist>tab/butt (4); motion: click button "…", then click tab "…", with prefers-reduced-motion: reduce: motio (4) |
| `/examples/dashboard` | red | behaviour: click button "…" (20); behaviour: not exercised: button "…" (20); behaviour: not exercised: textbox "…" (20) |
| `/examples/playground` | red | behaviour: click combobox "…", then click option "…" (step 1) (24); behaviour: click combobox "…", then press Enter on option "…" (step 1) (5); behaviour: click combobox "…", then press Space on option "…" (step 1) (5) |
| `/examples/rtl` | red | behaviour: not exercised: option "…" (after click combobox "…") (26); behaviour: click button "…" (11); behaviour: not exercised: menuitem "…" (after click button "…") (7) |
| `/examples/tasks` | red | behaviour: click checkbox "…" (26); behaviour: click button "…" (21); behaviour: not exercised: menuitem "…" (after click button "…") (11) |
| `/login` | red | rendered: accessibility tree (4); a11y: landmarks (2); behaviour: not exercised: clickable <div> (no name: matched by structure and position) (1) |
| `/markless-migrate-no-such-page` | red | rendered: accessibility tree (2); a11y: landmarks (2) |
| `/preview/typeset/docs` | green |  |
| `/privacy` | red | rendered: accessibility tree (2); a11y: landmarks (2) |
| `/sera` | red | css: computed style of checkbox (11); behaviour: not exercised: button "…" (after click button "…") (8); behaviour: click button "…" (6) |
| `/skills` | red | behaviour: click link "…" (11); behaviour: click tab "…" (4); responsiveness: first interaction with tab "…" (4x CPU, mobile) (2) |
| `/terms` | red | rendered: accessibility tree (2); a11y: landmarks (2) |
| `/typeset` | red | network: browser request missing (1) |
| `/view/aria-nova/sidebar-rtl` | red | behaviour: click button "…", then click link "…" (step 1) (11); behaviour: click button "…" (9); behaviour: not exercised: menuitem "…" (after click button "…") (8) |
| `/view/base-nova/sidebar-rtl` | red | behaviour: click combobox, then click option "…", then click button "…" (step 1) (16); behaviour: click button "…", then click menuitem "…" (step 1) (8); behaviour: click combobox, then click option "…", then click button "…", then click menuite (6) |
| `/view/new-york-v4/dashboard-01` | red | behaviour: click button "…" (20); behaviour: not exercised: button "…" (17); behaviour: not exercised: textbox "…" (16) |
| `/view/new-york-v4/login-01` | green |  |
| `/view/new-york-v4/login-02` | green |  |
| `/view/new-york-v4/login-03` | green |  |
| `/view/new-york-v4/login-04` | green |  |
| `/view/new-york-v4/login-05` | green |  |
| `/view/new-york-v4/sidebar-01` | red | behaviour: click button "…", then click menuitem "…" (step 1) (3); behaviour: click button "…", then press Enter on menuitem "…" (step 1) (3); behaviour: click button "…", then press Space on menuitem "…" (step 1) (3) |
| `/view/new-york-v4/sidebar-02` | red | behaviour: click button "…" (6); a11y: press Enter on button "…" (6); a11y: press Space on button "…" (6) |
| `/view/new-york-v4/sidebar-03` | green |  |
| `/view/new-york-v4/sidebar-04` | green |  |
| `/view/new-york-v4/sidebar-05` | red | motion: click button "…": motion of generic (body/div) (2); motion: click button "…", with prefers-reduced-motion: reduce: motion of generic (body/d (2); motion: press Enter on button "…": motion of generic (body/div) (2) |
| `/view/new-york-v4/sidebar-06` | green |  |
| `/view/new-york-v4/sidebar-07` | red | behaviour: click button "…", then click menuitem "…" (step 1) (12); behaviour: click button "…", then press Enter on menuitem "…" (step 1) (10); behaviour: click button "…", then press Space on menuitem "…" (step 1) (10) |
| `/view/new-york-v4/sidebar-08` | green |  |
| `/view/new-york-v4/sidebar-09` | red | rendered: visible text (20); behaviour: click button "…" (6); a11y: press Enter on button "…" (6) |
| `/view/new-york-v4/sidebar-10` | red | behaviour: click button "…" (15); behaviour: click button (12); behaviour: click button "…", then click menuitem "…" (step 1) (8) |
| `/view/new-york-v4/sidebar-11` | red | behaviour: click button "…", then click button "…", then click button "…" (step 2) (4); behaviour: click button "…", then click button "…", then press Enter on button "…" (step 2) (4); behaviour: click button "…", then click button "…", then press Space on button "…" (step 2) (4) |
| `/view/new-york-v4/sidebar-12` | red | behaviour: click button "…", then click row "…" (step 1) (8); behaviour: click button "…", then press Space on row "…" (step 1) (8); behaviour: click button "…", then press Enter on row "…" (step 1) (8) |
| `/view/new-york-v4/sidebar-13` | red | rendered: accessibility tree (4); rendered: visible text (4); behaviour: click link "…" (3) |
| `/view/new-york-v4/sidebar-14` | green |  |
| `/view/new-york-v4/sidebar-15` | red | behaviour: click button "…" (16); a11y: press Enter on button "…" (16); a11y: press Space on button "…" (16) |
| `/view/new-york-v4/sidebar-16` | red | behaviour: click button "…", then click menuitem "…" (step 1) (8); behaviour: click button "…", then press Enter on menuitem "…" (step 1) (6); behaviour: click button "…", then press Space on menuitem "…" (step 1) (6) |
| `/view/new-york-v4/signup-01` | green |  |
| `/view/new-york-v4/signup-02` | green |  |
| `/view/new-york-v4/signup-03` | green |  |
| `/view/new-york-v4/signup-04` | green |  |
| `/view/new-york-v4/signup-05` | green |  |
| `/view/radix-nova/sidebar-rtl` | green |  |

</details>

## Check of the live preview on Markless 0.9.0 (2026-10-22, stopped)

`check --all --concurrency 2 --resume` of https://mm-shadcn-ui-new.vercel.app (Markless main fb5840dd packs, converter
before #39) against the old site served locally, with the exercise planning of #34 (sampled links, options, menu items
and tabs; controls shared by a layout assigned to the routes with room). Stopped after 6 h 30 min at 423 of 1,031
routes to free the machine's heavy-job slots for build-time work; its results are kept in `.migrate/check-progress`
and `check --resume` carries on.

- 189 green, 134 red, 99 not checked because Vercel's bot mitigation challenged the checker on the NEW
  deployment (403, `x-vercel-mitigated: challenge`, from about 07:44 to 12:26), 1 stopped by the 1800 s timeout.
  Green and red here count a route red only for failures no automatic rule covers (the run did not finish, so the
  checker's own acceptance pass has not run).
- The previous complete run (Markless main fbb80634): 786 green, 233 red, 7 not checked, of 1,026.
- 47 of the reds are `/docs/directory?page=N`: the deployment predates #36, so every page variant served page 1.

Leading causes (routes):

| Routes | Cause |
|---:|---|
| 64 | css: computed style of generic |
| 57 | rendered: accessibility tree |
| 57 | css: computed style of generic "…" |
| 56 | rendered: visible text |
| 55 | behaviour: click button "…" |
| 52 | behaviour: click button |
| 50 | behaviour: not exercised: button "…" (after click button "…") |
| 50 | behaviour: not exercised: link "…" |
| 48 | behaviour: not exercised: menuitem "…" (after click button) |
| 48 | responsiveness: first interaction with button "…" (desktop) |
| 48 | behaviour: not exercised: tab "…" |
| 48 | behaviour: not exercised: clickable <div> (no name: matched by structure and position) |
| 47 | css: computed style of link "…" |
| 47 | css: computed styles |
| 45 | css: computed style of svg |

<details><summary>Every route checked</summary>

| Route | Result | Leading causes |
|---|---|---|
| `/` | blocked (Vercel challenge on new) |  |
| `/blocks` | blocked (Vercel challenge on new) |  |
| `/blocks/authentication` | blocked (Vercel challenge on new) |  |
| `/blocks/dashboard` | blocked (Vercel challenge on new) |  |
| `/blocks/login` | blocked (Vercel challenge on new) |  |
| `/blocks/sidebar` | blocked (Vercel challenge on new) |  |
| `/blocks/signup` | blocked (Vercel challenge on new) |  |
| `/charts` | blocked (Vercel challenge on new) |  |
| `/charts/area` | blocked (Vercel challenge on new) |  |
| `/charts/bar` | blocked (Vercel challenge on new) |  |
| `/charts/line` | blocked (Vercel challenge on new) |  |
| `/charts/pie` | blocked (Vercel challenge on new) |  |
| `/charts/radar` | blocked (Vercel challenge on new) |  |
| `/charts/radial` | blocked (Vercel challenge on new) |  |
| `/charts/tooltip` | blocked (Vercel challenge on new) |  |
| `/cli` | blocked (Vercel challenge on new) |  |
| `/colors` | red | behaviour: not exercised: button "…" (277); behaviour: not exercised: combobox (26); behaviour: click button "…" (8) |
| `/components` | red | behaviour: not exercised: link "…" (77); behaviour: click button (1); behaviour: not exercised: clickable <div> (no name: matched by structure and position) (1) |
| `/create` | red | behaviour: not exercised: option "…" (after click button "…", then click button "…") (449); behaviour: not exercised: button "…" (after click button "…", then click button "…", then c (105); behaviour: click button "…", then click button "…", then click menuitemradio "…" (step 1) (52) |
| `/docs` | red | behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click button (1); behaviour: click button "…" (1) |
| `/docs/_blocks` | red | behaviour: click button, then click menuitem "…" (step 1) (5); motion: press Enter on button "…", with prefers-reduced-motion: reduce: extra motion of  (2); motion: click button, closed by a click outside it (step 2 of 3: closed by a click outsi (2) |
| `/docs/_v0` | green |  |
| `/docs/ai-elements` | red | behaviour: click button, then click menuitem "…" (step 1) (5); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click link "…" (2) |
| `/docs/ai-elements/aria/chain-of-thought` | red | behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click button "…" (4); behaviour: not exercised: tab "…" (4) |
| `/docs/ai-elements/aria/chat` | red | behaviour: not exercised: link "…" (96); behaviour: not exercised: tab "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/ai-elements/aria/checkpoint` | red | behaviour: click button, then click menuitem "…" (step 1) (5); behaviour: click button "…" (2); behaviour: click link "…" (2) |
| `/docs/ai-elements/aria/confirmation` | green |  |
| `/docs/ai-elements/aria/context` | green |  |
| `/docs/ai-elements/aria/file-tree` | green |  |
| `/docs/ai-elements/aria/inline-citation` | green |  |
| `/docs/ai-elements/aria/message` | red | behaviour: not exercised: link "…" (66); behaviour: not exercised: tab "…" (6); motion: hover button "…": motion of tooltip (tooltip/div) (6) |
| `/docs/ai-elements/aria/model-selector` | green |  |
| `/docs/ai-elements/aria/plan` | red | behaviour: click button "…" (6); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: not exercised: tab "…" (4) |
| `/docs/ai-elements/aria/prompt-input` | green |  |
| `/docs/ai-elements/aria/queue` | green |  |
| `/docs/ai-elements/aria/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/ai-elements/aria/sources` | green |  |
| `/docs/ai-elements/aria/stack-trace` | green |  |
| `/docs/ai-elements/aria/subagent` | green |  |
| `/docs/ai-elements/aria/suggestion` | green |  |
| `/docs/ai-elements/aria/task` | green |  |
| `/docs/ai-elements/aria/terminal` | green |  |
| `/docs/ai-elements/aria/test-results` | green |  |
| `/docs/ai-elements/aria/tool` | green |  |
| `/docs/ai-elements/base/chain-of-thought` | green |  |
| `/docs/ai-elements/base/chat` | red | behaviour: click button, then click menuitem "…" (step 1) (5); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click button "…" (4) |
| `/docs/ai-elements/base/checkpoint` | green |  |
| `/docs/ai-elements/base/confirmation` | green |  |
| `/docs/ai-elements/base/context` | red | behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click tab "…" (3); behaviour: click button "…" (2) |
| `/docs/ai-elements/base/file-tree` | red | behaviour: click button, then click menuitem "…" (step 1) (5); behaviour: click tab "…" (3); motion: click button "…": motion of button "…" (3) |
| `/docs/ai-elements/base/inline-citation` | green |  |
| `/docs/ai-elements/base/message` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: button "…" (8); behaviour: click button "…" (6) |
| `/docs/ai-elements/base/model-selector` | green |  |
| `/docs/ai-elements/base/plan` | green |  |
| `/docs/ai-elements/base/prompt-input` | green |  |
| `/docs/ai-elements/base/queue` | green |  |
| `/docs/ai-elements/base/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/ai-elements/base/sources` | green |  |
| `/docs/ai-elements/base/stack-trace` | green |  |
| `/docs/ai-elements/base/subagent` | green |  |
| `/docs/ai-elements/base/suggestion` | green |  |
| `/docs/ai-elements/base/task` | green |  |
| `/docs/ai-elements/base/terminal` | green |  |
| `/docs/ai-elements/base/test-results` | green |  |
| `/docs/ai-elements/base/tool` | green |  |
| `/docs/ai-elements/radix/chain-of-thought` | green |  |
| `/docs/ai-elements/radix/chat` | green |  |
| `/docs/ai-elements/radix/checkpoint` | green |  |
| `/docs/ai-elements/radix/confirmation` | green |  |
| `/docs/ai-elements/radix/context` | green |  |
| `/docs/ai-elements/radix/file-tree` | green |  |
| `/docs/ai-elements/radix/inline-citation` | green |  |
| `/docs/ai-elements/radix/message` | green |  |
| `/docs/ai-elements/radix/model-selector` | green |  |
| `/docs/ai-elements/radix/plan` | green |  |
| `/docs/ai-elements/radix/prompt-input` | green |  |
| `/docs/ai-elements/radix/queue` | green |  |
| `/docs/ai-elements/radix/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/ai-elements/radix/sources` | green |  |
| `/docs/ai-elements/radix/stack-trace` | green |  |
| `/docs/ai-elements/radix/subagent` | green |  |
| `/docs/ai-elements/radix/suggestion` | green |  |
| `/docs/ai-elements/radix/task` | green |  |
| `/docs/ai-elements/radix/terminal` | green |  |
| `/docs/ai-elements/radix/test-results` | green |  |
| `/docs/ai-elements/radix/tool` | green |  |
| `/docs/changelog` | red | behaviour: not exercised: link "…" (199); behaviour: not exercised: tab "…" (36); behaviour: not exercised: button "…" (19) |
| `/docs/changelog/2023-06-new-cli` | red | behaviour: not exercised: link "…" (137); behaviour: not exercised: tab "…" (20); behaviour: not exercised: button "…" (10) |
| `/docs/changelog/2023-07-javascript` | green |  |
| `/docs/changelog/2023-12-new-components` | red | behaviour: not exercised: clickable <g> in dialog>application (no name: matched by structur (13); behaviour: click button "…" (8); behaviour: not exercised: button "…" (after click button "…") (6) |
| `/docs/changelog/2024-03-blocks` | green |  |
| `/docs/changelog/2024-03-breadcrumb-otp` | red | behaviour: not exercised: link "…" (13); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: not exercised: menuitem "…" (after click button "…") (3) |
| `/docs/changelog/2024-04-lift-mode` | green |  |
| `/docs/changelog/2024-08-npx-shadcn-init` | green |  |
| `/docs/changelog/2024-10-react-19` | green |  |
| `/docs/changelog/2024-10-sidebar` | green |  |
| `/docs/changelog/2024-11-icons` | green |  |
| `/docs/changelog/2024-12-monorepo` | green |  |
| `/docs/changelog/2025-01-blocks` | green |  |
| `/docs/changelog/2025-02-registry-schema` | green |  |
| `/docs/changelog/2025-02-tailwind-v4` | green |  |
| `/docs/changelog/2025-04-cross-framework` | green |  |
| `/docs/changelog/2025-04-mcp` | green |  |
| `/docs/changelog/2025-04-shadcn-2-5` | green |  |
| `/docs/changelog/2025-05-new-site` | green |  |
| `/docs/changelog/2025-06-calendar` | green |  |
| `/docs/changelog/2025-06-radix-ui` | green |  |
| `/docs/changelog/2025-07-local-file-support` | green |  |
| `/docs/changelog/2025-07-universal-registry` | green |  |
| `/docs/changelog/2025-08-cli-3-mcp` | green |  |
| `/docs/changelog/2025-09-registry-index` | green |  |
| `/docs/changelog/2025-10-new-components` | red | behaviour: not exercised: link "…" (137); behaviour: not exercised: button "…" (68); behaviour: not exercised: textbox "…" (23) |
| `/docs/changelog/2025-10-registry-directory` | green |  |
| `/docs/changelog/2025-12-shadcn-create` | green |  |
| `/docs/changelog/2026-01-base-ui` | green |  |
| `/docs/changelog/2026-01-inline-side-styles` | green |  |
| `/docs/changelog/2026-01-rtl` | red | behaviour: not exercised: link "…" (68); behaviour: not exercised: tab "…" (12); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/changelog/2026-02-blocks` | green |  |
| `/docs/changelog/2026-02-radix-ui` | green |  |
| `/docs/changelog/2026-03-cli-v4` | green |  |
| `/docs/changelog/2026-03-luma` | green |  |
| `/docs/changelog/2026-04-component-composition` | green |  |
| `/docs/changelog/2026-04-partial-preset-apply` | green |  |
| `/docs/changelog/2026-04-pointer-cursor` | green |  |
| `/docs/changelog/2026-04-preset-commands` | green |  |
| `/docs/changelog/2026-04-sera` | green |  |
| `/docs/changelog/2026-04-shadcn-apply` | green |  |
| `/docs/changelog/2026-05-package-imports-target-aliases` | green |  |
| `/docs/changelog/2026-05-registry-include` | green |  |
| `/docs/changelog/2026-05-rhea` | green |  |
| `/docs/changelog/2026-05-shadcn-eject` | green |  |
| `/docs/changelog/2026-06-chat-components` | green |  |
| `/docs/changelog/2026-06-github-registries` | green |  |
| `/docs/changelog/2026-07-base-ui-default` | green |  |
| `/docs/changelog/2026-07-dynamic-search` | green |  |
| `/docs/changelog/2026-07-helpers` | green |  |
| `/docs/changelog/2026-07-react-aria` | green |  |
| `/docs/changelog/2026-07-toast` | green |  |
| `/docs/changelog/2026-07-typeset` | green |  |
| `/docs/changelog/2026-08-helpers-human-in-the-loop` | green |  |
| `/docs/changelog/2026-08-private-github-registries` | green |  |
| `/docs/changelog/2026-08-questionnaire` | red | behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click tab "…" (4); behaviour: not exercised: tab "…" (3) |
| `/docs/changelog/2026-09-cn` | green |  |
| `/docs/changelog/2026-10-ai-elements` | red | behaviour: not exercised: link "…" (139); behaviour: not exercised: tab "…" (8); behaviour: click button "…" (6) |
| `/docs/cli` | green |  |
| `/docs/components` | green |  |
| `/docs/components-json` | green |  |
| `/docs/components/aria/accordion` | red | behaviour: not exercised: link "…" (113); behaviour: click button "…" (28); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/alert` | red | behaviour: not exercised: link "…" (64); behaviour: click button "…" (7); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/alert-dialog` | green |  |
| `/docs/components/aria/aspect-ratio` | green |  |
| `/docs/components/aria/attachment` | red | behaviour: not exercised: link "…" (47); behaviour: click button "…" (8); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/avatar` | green |  |
| `/docs/components/aria/badge` | green |  |
| `/docs/components/aria/breadcrumb` | red | behaviour: not exercised: link "…" (156); behaviour: click button "…" (11); motion: click button "…": extra motion of link "…" (8) |
| `/docs/components/aria/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/components/aria/button` | red | behaviour: not exercised: link "…" (139); behaviour: click button "…" (18); behaviour: not exercised: menuitem "…" (after click button "…") (7) |
| `/docs/components/aria/button-group` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: button "…" (37); behaviour: not exercised: button (8) |
| `/docs/components/aria/calendar` | red | behaviour: not exercised: button "…" (359); behaviour: not exercised: link "…" (145); behaviour: not exercised: row "…" (22) |
| `/docs/components/aria/card` | red | behaviour: not exercised: link "…" (142); behaviour: not exercised: button "…" (10); behaviour: click button "…" (6) |
| `/docs/components/aria/carousel` | red | behaviour: not exercised: link "…" (133); behaviour: click button "…" (13); behaviour: not exercised: button "…" (after click button "…") (8) |
| `/docs/components/aria/chart` | red | css: computed style of g (3) |
| `/docs/components/aria/checkbox` | green |  |
| `/docs/components/aria/code-block` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (47); behaviour: click button "…" (10) |
| `/docs/components/aria/collapsible` | red | behaviour: not exercised: button "…" (after click button "…") (16); behaviour: not exercised: link "…" (15); behaviour: click button "…" (14) |
| `/docs/components/aria/combobox` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: option "…" (after click button "…") (23); behaviour: click button "…" (11) |
| `/docs/components/aria/command` | red | behaviour: not exercised: link "…" (90); behaviour: not exercised: menuitem "…" (after click button "…") (23); behaviour: click button "…" (11) |
| `/docs/components/aria/context-menu` | red | behaviour: not exercised: link "…" (81); behaviour: click button "…" (12); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/data-table` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (41); rendered: accessibility tree (34) |
| `/docs/components/aria/date-picker` | red | behaviour: not exercised: link "…" (142); behaviour: not exercised: button "…" (after click button "…") (36); behaviour: not exercised: button "…" (16) |
| `/docs/components/aria/dialog` | green |  |
| `/docs/components/aria/direction` | green |  |
| `/docs/components/aria/drawer` | red | behaviour: not exercised: link "…" (143); behaviour: click button "…" (14); behaviour: not exercised: button "…" (after click button "…") (7) |
| `/docs/components/aria/dropdown-menu` | green |  |
| `/docs/components/aria/empty` | green |  |
| `/docs/components/aria/field` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (39); behaviour: not exercised: option "…" (after click button "…") (30) |
| `/docs/components/aria/hover-card` | green |  |
| `/docs/components/aria/input` | red | behaviour: not exercised: link "…" (68); behaviour: click button "…" (17); motion: type "…" into textbox "…": extra motion of link "…" (8) |
| `/docs/components/aria/input-group` | green |  |
| `/docs/components/aria/input-otp` | red | css: computed style of generic (2); css: computed style of group (1) |
| `/docs/components/aria/item` | green |  |
| `/docs/components/aria/kbd` | green |  |
| `/docs/components/aria/label` | green |  |
| `/docs/components/aria/marker` | green |  |
| `/docs/components/aria/message` | red | behaviour: not exercised: link "…" (121); motion: click button "…": extra motion of link "…" (7); motion: click button "…", with prefers-reduced-motion: reduce: extra motion of link "…" (7) |
| `/docs/components/aria/message-scroller` | red | behaviour: not exercised: link "…" (144); behaviour: not exercised: button "…" (52); css: computed style of region "…" (12) |
| `/docs/components/aria/native-select` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: tab "…" (6); motion: click button "…": extra motion of link "…" (6) |
| `/docs/components/aria/pagination` | red | behaviour: not exercised: link "…" (35); behaviour: not exercised: tab "…" (6); behaviour: click button "…" (5) |
| `/docs/components/aria/popover` | green |  |
| `/docs/components/aria/progress` | green |  |
| `/docs/components/aria/questionnaire` | red | http: the check of this route (1) |
| `/docs/components/aria/radio-group` | red | behaviour: not exercised: link "…" (130); behaviour: click button "…" (8); motion: click button "…": extra motion of link "…" (7) |
| `/docs/components/aria/resizable` | green |  |
| `/docs/components/aria/scroll-area` | green |  |
| `/docs/components/aria/select` | red | behaviour: not exercised: option "…" (after click button "…") (62); behaviour: click button "…" (14); behaviour: not exercised: clickable "…" (after click button "…") (10) |
| `/docs/components/aria/separator` | green |  |
| `/docs/components/aria/sheet` | green |  |
| `/docs/components/aria/sidebar` | red | behaviour: not exercised: link "…" (145); behaviour: not exercised: button "…" (20); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/skeleton` | green |  |
| `/docs/components/aria/slider` | red | css: computed style of group "…" (5); css: computed style of generic (3) |
| `/docs/components/aria/sonner` | green |  |
| `/docs/components/aria/spinner` | green |  |
| `/docs/components/aria/switch` | red | behaviour: not exercised: link "…" (29); behaviour: click button "…" (8); behaviour: click link "…" (8) |
| `/docs/components/aria/table` | green |  |
| `/docs/components/aria/tabs` | green |  |
| `/docs/components/aria/textarea` | green |  |
| `/docs/components/aria/toast` | green |  |
| `/docs/components/aria/toggle` | green |  |
| `/docs/components/aria/toggle-group` | not checked | check timeout |
| `/docs/components/aria/tooltip` | green |  |
| `/docs/components/aria/trace` | red | behaviour: not exercised: link "…" (145); behaviour: click button "…" (23); behaviour: not exercised: button "…" (21) |
| `/docs/components/aria/typography` | blocked (Vercel challenge on new) |  |
| `/docs/components/attachment` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/accordion` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/alert` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/alert-dialog` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/aspect-ratio` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/attachment` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/avatar` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/badge` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/breadcrumb` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/bubble` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/button` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/button-group` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/calendar` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/card` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/carousel` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/chart` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/checkbox` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/code-block` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/collapsible` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/combobox` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/command` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/context-menu` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/data-table` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/date-picker` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/dialog` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/direction` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/drawer` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/dropdown-menu` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/empty` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/field` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/hover-card` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/input` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/input-group` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/input-otp` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/item` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/kbd` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/label` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/marker` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/menubar` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/message` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/message-scroller` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/native-select` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/navigation-menu` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/pagination` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/popover` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/progress` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/questionnaire` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/radio-group` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/resizable` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/scroll-area` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/select` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/separator` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/sheet` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/sidebar` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/skeleton` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/slider` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/spinner` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/switch` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/table` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/tabs` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/textarea` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/toast` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/toggle` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/toggle-group` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/tooltip` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/trace` | blocked (Vercel challenge on new) |  |
| `/docs/components/base/typography` | blocked (Vercel challenge on new) |  |
| `/docs/components/breadcrumb` | blocked (Vercel challenge on new) |  |
| `/docs/components/bubble` | blocked (Vercel challenge on new) |  |
| `/docs/components/button` | blocked (Vercel challenge on new) |  |
| `/docs/components/button-group` | blocked (Vercel challenge on new) |  |
| `/docs/components/calendar` | blocked (Vercel challenge on new) |  |
| `/docs/components/chart` | blocked (Vercel challenge on new) |  |
| `/docs/components/collapsible` | blocked (Vercel challenge on new) |  |
| `/docs/components/data-table` | blocked (Vercel challenge on new) |  |
| `/docs/components/input-group` | blocked (Vercel challenge on new) |  |
| `/docs/components/input-otp` | blocked (Vercel challenge on new) |  |
| `/docs/components/marker` | blocked (Vercel challenge on new) |  |
| `/docs/components/message` | blocked (Vercel challenge on new) |  |
| `/docs/components/message-scroller` | blocked (Vercel challenge on new) |  |
| `/docs/components/popover` | blocked (Vercel challenge on new) |  |
| `/docs/components/radix/accordion` | blocked (Vercel challenge on new) |  |
| `/docs/components/radix/alert` | green |  |
| `/docs/components/radix/alert-dialog` | green |  |
| `/docs/components/radix/aspect-ratio` | green |  |
| `/docs/components/radix/attachment` | green |  |
| `/docs/components/radix/avatar` | red | rendered: accessibility tree (20); rendered: visible text (20); assets: image https://github.com/shadcn.png (13) |
| `/docs/components/radix/badge` | green |  |
| `/docs/components/radix/breadcrumb` | green |  |
| `/docs/components/radix/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (2); css: computed style of generic (1) |
| `/docs/components/radix/button` | green |  |
| `/docs/components/radix/button-group` | red | behaviour: not exercised: link "…" (146); behaviour: not exercised: button "…" (30); behaviour: not exercised: menuitem "…" (after click button "…") (7) |
| `/docs/components/radix/calendar` | red | rendered: accessibility tree (10) |
| `/docs/components/radix/card` | red | behaviour: not exercised: link "…" (145); behaviour: click button "…" (7); behaviour: not exercised: tab "…" (6) |
| `/docs/components/radix/carousel` | red | css: computed style of generic (3); rendered: accessibility tree (1); css: computed style of button "…" (1) |
| `/docs/components/radix/chart` | red | css: computed style of g (3) |
| `/docs/components/radix/checkbox` | red | rendered: accessibility tree (2); css: computed style of checkbox (1) |
| `/docs/components/radix/code-block` | green |  |
| `/docs/components/radix/collapsible` | green |  |
| `/docs/components/radix/combobox` | green |  |
| `/docs/components/radix/command` | green |  |
| `/docs/components/radix/context-menu` | red | behaviour: not exercised: link "…" (22); behaviour: click button "…" (11); behaviour: not exercised: clickable "…" (10) |
| `/docs/components/radix/data-table` | red | rendered: accessibility tree (17); css: computed style of generic (5); css: computed style of generic "…" (3) |
| `/docs/components/radix/date-picker` | green |  |
| `/docs/components/radix/dialog` | green |  |
| `/docs/components/radix/direction` | green |  |
| `/docs/components/radix/drawer` | red | behaviour: not exercised: link "…" (144); behaviour: click button "…" (14); behaviour: not exercised: clickable <g> in dialog>application (no name: matched by structur (14) |
| `/docs/components/radix/dropdown-menu` | red | rendered: accessibility tree (2); rendered: visible text (1); a11y: axe color-contrast: Elements must meet minimum color contrast ratio thresholds (1) |
| `/docs/components/radix/empty` | red | rendered: accessibility tree (6); rendered: visible text (4); assets: image https://github.com/shadcn.png (2) |
| `/docs/components/radix/field` | red | behaviour: not exercised: link "…" (147); behaviour: not exercised: button "…" (34); behaviour: not exercised: checkbox "…" (7) |
| `/docs/components/radix/hover-card` | green |  |
| `/docs/components/radix/input` | red | behaviour: not exercised: link "…" (147); behaviour: not exercised: button "…" (14); motion: type "…" into textbox "…": extra motion of link "…" (10) |
| `/docs/components/radix/input-group` | green |  |
| `/docs/components/radix/input-otp` | red | css: computed style of generic (2); css: computed style of group (1) |
| `/docs/components/radix/item` | green |  |
| `/docs/components/radix/kbd` | green |  |
| `/docs/components/radix/label` | red | behaviour: not exercised: option "…" (after click combobox "…") (18); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click button "…" (4) |
| `/docs/components/radix/marker` | green |  |
| `/docs/components/radix/menubar` | green |  |
| `/docs/components/radix/message` | green |  |
| `/docs/components/radix/message-scroller` | red | behaviour: not exercised: link "…" (147); behaviour: not exercised: button "…" (51); css: computed style of region "…" (12) |
| `/docs/components/radix/native-select` | green |  |
| `/docs/components/radix/navigation-menu` | green |  |
| `/docs/components/radix/pagination` | red | behaviour: not exercised: link "…" (36); behaviour: not exercised: tab "…" (6); behaviour: click button "…" (5) |
| `/docs/components/radix/popover` | green |  |
| `/docs/components/radix/progress` | red | behaviour: not exercised: link "…" (114); behaviour: not exercised: tab "…" (6); behaviour: click button "…" (5) |
| `/docs/components/radix/questionnaire` | red | css: computed style of generic (1) |
| `/docs/components/radix/radio-group` | green |  |
| `/docs/components/radix/resizable` | green |  |
| `/docs/components/radix/scroll-area` | green |  |
| `/docs/components/radix/select` | red | behaviour: not exercised: link "…" (48); behaviour: click button "…" (8); behaviour: not exercised: combobox (7) |
| `/docs/components/radix/separator` | green |  |
| `/docs/components/radix/sheet` | green |  |
| `/docs/components/radix/sidebar` | green |  |
| `/docs/components/radix/skeleton` | green |  |
| `/docs/components/radix/slider` | red | css: computed style of generic (8) |
| `/docs/components/radix/sonner` | green |  |
| `/docs/components/radix/spinner` | green |  |
| `/docs/components/radix/switch` | green |  |
| `/docs/components/radix/table` | green |  |
| `/docs/components/radix/tabs` | green |  |
| `/docs/components/radix/textarea` | green |  |
| `/docs/components/radix/toast` | green |  |
| `/docs/components/radix/toggle` | green |  |
| `/docs/components/radix/toggle-group` | red | behaviour: not exercised: link "…" (70); behaviour: not exercised: radio "…" (21); behaviour: click button "…" (6) |
| `/docs/components/radix/tooltip` | green |  |
| `/docs/components/radix/trace` | green |  |
| `/docs/components/radix/typography` | green |  |
| `/docs/components/scroll-area` | red | css: computed style of generic (1) |
| `/docs/components/select` | green |  |
| `/docs/components/spinner` | green |  |
| `/docs/components/tooltip` | green |  |
| `/docs/dark-mode` | green |  |
| `/docs/dark-mode/astro` | green |  |
| `/docs/dark-mode/next` | green |  |
| `/docs/dark-mode/remix` | green |  |
| `/docs/dark-mode/tanstack-start` | green |  |
| `/docs/dark-mode/vite` | green |  |
| `/docs/directory` | green |  |
| `/docs/directory?page=10` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (9) |
| `/docs/directory?page=11` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (8) |
| `/docs/directory?page=12` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (12) |
| `/docs/directory?page=13` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (6) |
| `/docs/directory?page=14` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (10) |
| `/docs/directory?page=15` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (12) |
| `/docs/directory?page=16` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (9) |
| `/docs/directory?page=17` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (12) |
| `/docs/directory?page=18` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (11) |
| `/docs/directory?page=19` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (9) |
| `/docs/directory?page=2` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (12) |
| `/docs/directory?page=20` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (15) |
| `/docs/directory?page=21` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (6) |
| `/docs/directory?page=22` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (12) |
| `/docs/directory?page=23` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (8) |
| `/docs/directory?page=24` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (13) |
| `/docs/directory?page=25` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (11) |
| `/docs/directory?page=26` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (7) |
| `/docs/directory?page=27` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (12) |
| `/docs/directory?page=28` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (10) |
| `/docs/directory?page=29` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (8) |
| `/docs/directory?page=3` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (12) |
| `/docs/directory?page=30` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (9) |
| `/docs/directory?page=31` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (8) |
| `/docs/directory?page=32` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (7) |
| `/docs/directory?page=33` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (9) |
| `/docs/directory?page=34` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (7) |
| `/docs/directory?page=35` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (9) |
| `/docs/directory?page=36` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (9) |
| `/docs/directory?page=37` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (8) |
| `/docs/directory?page=38` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (10) |
| `/docs/directory?page=39` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (12) |
| `/docs/directory?page=4` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (7) |
| `/docs/directory?page=40` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (13) |
| `/docs/directory?page=41` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (8) |
| `/docs/directory?page=42` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (15) |
| `/docs/directory?page=43` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (7) |
| `/docs/directory?page=44` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (12) |
| `/docs/directory?page=45` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (14) |
| `/docs/directory?page=46` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (11) |
| `/docs/directory?page=47` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (8) |
| `/docs/directory?page=48` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (6) |
| `/docs/directory?page=5` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (9) |
| `/docs/directory?page=6` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (8) |
| `/docs/directory?page=7` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (7) |
| `/docs/directory?page=8` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (8) |
| `/docs/directory?page=9` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (7) |
| `/docs/figma` | green |  |
| `/docs/forms` | green |  |
| `/docs/forms/formisch` | red | http: the check of this route (1) |
| `/docs/forms/next` | red | behaviour: not exercised: link "…" (138); rendered: accessibility tree (40); behaviour: not exercised: button "…" (30) |
| `/docs/forms/react-hook-form` | red | rendered: accessibility tree (7); css: computed style of generic "…" (2); css: computed style of checkbox (2) |

</details>

## Check of the live preview (2026-10-22)

`check --all --concurrency 2` of https://mm-shadcn-ui-new.vercel.app (Markless main fbb80634, converter at d869718)
against the old site served locally (the old deployment answers 403 to a headless browser), with in-place navigation
and its swap-frames recording, and motion: 786 of 1026 routes green, 233 red, 7 not checked (timeouts); 48 before.
In-place navigation: 31 swaps on 19 pages, no theme flash recorded. 11 h 20 min. `/llm` answered 500 (its handler
ran only for the 383 `/docs/*.md` paths; the converter now runs it for the bare path too). The toasts on the four
sonner and toast routes were not on that deploy (their region is a route's own body child, now rendered by the page).

Leading causes (routes):

| Routes | Cause |
|---:|---|
| 104 | behaviour: not exercised: button "…", shared with / |
| 104 | behaviour: not exercised: link "…", shared with / |
| 97 | behaviour: click button "…" |
| 90 | behaviour: not exercised: link "…" |
| 88 | behaviour: not exercised: clickable <div> (no name: matched by structure and posi |
| 85 | behaviour: not exercised: tab "…" |
| 84 | rendered: accessibility tree |
| 78 | behaviour: click button |
| 74 | behaviour: not exercised: button "…" (after click button "…") |
| 71 | behaviour: not exercised: menuitem "…" (after click button) |
| 68 | rendered: visible text |
| 63 | css: computed style of generic (main/div) |
| 59 | behaviour: not exercised: combobox |
| 49 | css: computed style of generic "…" (main>link/span) |
| 48 | css: computed styles |

<details><summary>Every route</summary>

786 green, 233 red, 7 not checked, of 1026

| Route | Result | Leading causes |
|---|---|---|
| `/` | red | behaviour: not exercised: option "…" (after click button "…") (449); behaviour: not exercised: menuitem "…" (after click button "…") (10); behaviour: not exercised: link "…" (9) |
| `/blocks` | red | behaviour: not exercised: link "…", shared with / (9); behaviour: click tab "…", then click button "…" (step 1) (8); behaviour: not exercised: button "…" (after click tab "…") (6) |
| `/blocks/authentication` | not checked | infrastructure |
| `/blocks/dashboard` | red | navigation: back to /blocks/dashboard after going in place from /blocks/dashboard  |
| `/blocks/login` | green |  |
| `/blocks/sidebar` | green |  |
| `/blocks/signup` | green |  |
| `/charts` | not checked | infrastructure |
| `/charts/area` | not checked | infrastructure |
| `/charts/bar` | green |  |
| `/charts/line` | green |  |
| `/charts/pie` | not checked | infrastructure |
| `/charts/radar` | red | css: computed style of iframe "…" (main/iframe) (3) |
| `/charts/radial` | green |  |
| `/charts/tooltip` | red | css: computed style of iframe "…" (main/iframe) (8) |
| `/cli` | red | behaviour: not exercised: link "…" (153); behaviour: not exercised: tab "…" (128); behaviour: not exercised: link "…", shared with / (9) |
| `/colors` | red | behaviour: not exercised: button "…" (285); behaviour: not exercised: combobox (26); behaviour: click button "…" (8) |
| `/components` | red | behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: button "…", shared with / (2); behaviour: click button |
| `/create` | red | behaviour: not exercised: option "…" (after click button "…", then click button " (455); behaviour: not exercised: button "…" (after click button "…", then click button " (148); behaviour: click button "…", then click button "…", then click menuitemradio "…"  (68) |
| `/docs` | red | behaviour: not exercised: link "…", shared with / (9); behaviour: click button, then click menuitem "…" (step 1) (5); motion: click button "…" : frame of region "…" (main>region/div) (2) |
| `/docs/_blocks` | red | behaviour: not exercised: link "…", shared with / (9); behaviour: click link "…" (5); behaviour: click button, then click menuitem "…" (step 1) (5) |
| `/docs/_v0` | green |  |
| `/docs/ai-elements` | red | behaviour: not exercised: link "…" (159); behaviour: not exercised: link "…", shared with / (9); behaviour: click link "…" (7) |
| `/docs/ai-elements/aria/chain-of-thought` | red | behaviour: not exercised: link "…" (96); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/aria/chat` | red | behaviour: not exercised: link "…" (113); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/aria/checkpoint` | red | behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click link "…" (4) |
| `/docs/ai-elements/aria/confirmation` | green |  |
| `/docs/ai-elements/aria/context` | green |  |
| `/docs/ai-elements/aria/file-tree` | green |  |
| `/docs/ai-elements/aria/inline-citation` | green |  |
| `/docs/ai-elements/aria/message` | red | behaviour: not exercised: link "…" (161); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/aria/model-selector` | green |  |
| `/docs/ai-elements/aria/plan` | red | behaviour: not exercised: link "…" (70); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (6) |
| `/docs/ai-elements/aria/prompt-input` | green |  |
| `/docs/ai-elements/aria/queue` | green |  |
| `/docs/ai-elements/aria/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (main>link/span) (2); css: computed style of generic (main/div) |
| `/docs/ai-elements/aria/sources` | green |  |
| `/docs/ai-elements/aria/stack-trace` | green |  |
| `/docs/ai-elements/aria/subagent` | green |  |
| `/docs/ai-elements/aria/suggestion` | green |  |
| `/docs/ai-elements/aria/task` | green |  |
| `/docs/ai-elements/aria/terminal` | green |  |
| `/docs/ai-elements/aria/test-results` | green |  |
| `/docs/ai-elements/aria/tool` | green |  |
| `/docs/ai-elements/base/chain-of-thought` | green |  |
| `/docs/ai-elements/base/chat` | red | behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: menuitem "…" (after click button) (5); behaviour: click button "…" (4) |
| `/docs/ai-elements/base/checkpoint` | green |  |
| `/docs/ai-elements/base/confirmation` | green |  |
| `/docs/ai-elements/base/context` | red | behaviour: not exercised: link "…" (101); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/base/file-tree` | red | behaviour: not exercised: link "…" (30); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/ai-elements/base/inline-citation` | green |  |
| `/docs/ai-elements/base/message` | red | behaviour: not exercised: link "…" (156); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (8) |
| `/docs/ai-elements/base/model-selector` | green |  |
| `/docs/ai-elements/base/plan` | green |  |
| `/docs/ai-elements/base/prompt-input` | green |  |
| `/docs/ai-elements/base/queue` | green |  |
| `/docs/ai-elements/base/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (main>link/span) (2); css: computed style of generic (main/div) |
| `/docs/ai-elements/base/sources` | green |  |
| `/docs/ai-elements/base/stack-trace` | green |  |
| `/docs/ai-elements/base/subagent` | green |  |
| `/docs/ai-elements/base/suggestion` | green |  |
| `/docs/ai-elements/base/task` | green |  |
| `/docs/ai-elements/base/terminal` | green |  |
| `/docs/ai-elements/base/test-results` | green |  |
| `/docs/ai-elements/base/tool` | green |  |
| `/docs/ai-elements/radix/chain-of-thought` | green |  |
| `/docs/ai-elements/radix/chat` | green |  |
| `/docs/ai-elements/radix/checkpoint` | green |  |
| `/docs/ai-elements/radix/confirmation` | green |  |
| `/docs/ai-elements/radix/context` | green |  |
| `/docs/ai-elements/radix/file-tree` | green |  |
| `/docs/ai-elements/radix/inline-citation` | green |  |
| `/docs/ai-elements/radix/message` | green |  |
| `/docs/ai-elements/radix/model-selector` | green |  |
| `/docs/ai-elements/radix/plan` | green |  |
| `/docs/ai-elements/radix/prompt-input` | green |  |
| `/docs/ai-elements/radix/queue` | green |  |
| `/docs/ai-elements/radix/reasoning` | red | rendered: visible text (2); css: computed style of generic "…" (main>link/span) (2); css: computed style of generic (main/div) |
| `/docs/ai-elements/radix/sources` | green |  |
| `/docs/ai-elements/radix/stack-trace` | green |  |
| `/docs/ai-elements/radix/subagent` | green |  |
| `/docs/ai-elements/radix/suggestion` | green |  |
| `/docs/ai-elements/radix/task` | green |  |
| `/docs/ai-elements/radix/terminal` | green |  |
| `/docs/ai-elements/radix/test-results` | green |  |
| `/docs/ai-elements/radix/tool` | green |  |
| `/docs/changelog` | red | behaviour: not exercised: link "…" (236); behaviour: not exercised: tab "…" (36); behaviour: not exercised: button "…" (32) |
| `/docs/changelog/2023-06-new-cli` | red | behaviour: not exercised: link "…" (183); behaviour: not exercised: tab "…" (20); behaviour: not exercised: button "…" (11) |
| `/docs/changelog/2023-07-javascript` | green |  |
| `/docs/changelog/2023-12-new-components` | red | behaviour: not exercised: clickable <g> in dialog>application (no name: matched b (13); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (8) |
| `/docs/changelog/2024-03-blocks` | green |  |
| `/docs/changelog/2024-03-breadcrumb-otp` | red | behaviour: not exercised: link "…" (43); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/changelog/2024-04-lift-mode` | green |  |
| `/docs/changelog/2024-08-npx-shadcn-init` | green |  |
| `/docs/changelog/2024-10-react-19` | green |  |
| `/docs/changelog/2024-10-sidebar` | green |  |
| `/docs/changelog/2024-11-icons` | green |  |
| `/docs/changelog/2024-12-monorepo` | green |  |
| `/docs/changelog/2025-01-blocks` | green |  |
| `/docs/changelog/2025-02-registry-schema` | green |  |
| `/docs/changelog/2025-02-tailwind-v4` | green |  |
| `/docs/changelog/2025-04-cross-framework` | green |  |
| `/docs/changelog/2025-04-mcp` | green |  |
| `/docs/changelog/2025-04-shadcn-2-5` | green |  |
| `/docs/changelog/2025-05-new-site` | green |  |
| `/docs/changelog/2025-06-calendar` | green |  |
| `/docs/changelog/2025-06-radix-ui` | green |  |
| `/docs/changelog/2025-07-local-file-support` | green |  |
| `/docs/changelog/2025-07-universal-registry` | green |  |
| `/docs/changelog/2025-08-cli-3-mcp` | green |  |
| `/docs/changelog/2025-09-registry-index` | green |  |
| `/docs/changelog/2025-10-new-components` | red | behaviour: not exercised: link "…" (161); behaviour: not exercised: button "…" (67); behaviour: not exercised: textbox "…" (23) |
| `/docs/changelog/2025-10-registry-directory` | green |  |
| `/docs/changelog/2025-12-shadcn-create` | green |  |
| `/docs/changelog/2026-01-base-ui` | green |  |
| `/docs/changelog/2026-01-inline-side-styles` | green |  |
| `/docs/changelog/2026-01-rtl` | red | behaviour: not exercised: tab "…" (12); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: link "…" (5) |
| `/docs/changelog/2026-02-blocks` | green |  |
| `/docs/changelog/2026-02-radix-ui` | green |  |
| `/docs/changelog/2026-03-cli-v4` | green |  |
| `/docs/changelog/2026-03-luma` | green |  |
| `/docs/changelog/2026-04-component-composition` | green |  |
| `/docs/changelog/2026-04-partial-preset-apply` | green |  |
| `/docs/changelog/2026-04-pointer-cursor` | green |  |
| `/docs/changelog/2026-04-preset-commands` | green |  |
| `/docs/changelog/2026-04-sera` | green |  |
| `/docs/changelog/2026-04-shadcn-apply` | green |  |
| `/docs/changelog/2026-05-package-imports-target-aliases` | green |  |
| `/docs/changelog/2026-05-registry-include` | green |  |
| `/docs/changelog/2026-05-rhea` | green |  |
| `/docs/changelog/2026-05-shadcn-eject` | green |  |
| `/docs/changelog/2026-06-chat-components` | green |  |
| `/docs/changelog/2026-06-github-registries` | green |  |
| `/docs/changelog/2026-07-base-ui-default` | green |  |
| `/docs/changelog/2026-07-dynamic-search` | not checked | infrastructure |
| `/docs/changelog/2026-07-helpers` | green |  |
| `/docs/changelog/2026-07-react-aria` | green |  |
| `/docs/changelog/2026-07-toast` | green |  |
| `/docs/changelog/2026-07-typeset` | green |  |
| `/docs/changelog/2026-08-helpers-human-in-the-loop` | green |  |
| `/docs/changelog/2026-08-private-github-registries` | green |  |
| `/docs/changelog/2026-08-questionnaire` | red | behaviour: not exercised: link "…" (48); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/changelog/2026-09-cn` | green |  |
| `/docs/changelog/2026-10-ai-elements` | red | behaviour: not exercised: link "…" (166); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (8) |
| `/docs/cli` | green |  |
| `/docs/components` | green |  |
| `/docs/components-json` | green |  |
| `/docs/components/aria/accordion` | red | behaviour: not exercised: link "…" (162); behaviour: click button "…" (26); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/alert` | red | behaviour: not exercised: link "…" (90); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (7) |
| `/docs/components/aria/alert-dialog` | green |  |
| `/docs/components/aria/aspect-ratio` | green |  |
| `/docs/components/aria/attachment` | red | behaviour: not exercised: link "…" (175); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (7) |
| `/docs/components/aria/avatar` | green |  |
| `/docs/components/aria/badge` | green |  |
| `/docs/components/aria/breadcrumb` | red | behaviour: not exercised: link "…" (182); behaviour: click button "…" (11); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (main>link/span) (2); css: computed style of generic (main/div) |
| `/docs/components/aria/button` | red | behaviour: not exercised: link "…" (182); behaviour: not exercised: button "…" (26); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/button-group` | red | behaviour: not exercised: link "…" (183); behaviour: not exercised: button "…" (42); behaviour: not exercised: button (10) |
| `/docs/components/aria/calendar` | red | behaviour: not exercised: button "…" (358); behaviour: not exercised: link "…" (168); behaviour: not exercised: row "…" (22) |
| `/docs/components/aria/card` | red | behaviour: not exercised: link "…" (176); behaviour: not exercised: button "…" (23); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/carousel` | red | behaviour: not exercised: link "…" (168); behaviour: click button "…" (17); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/chart` | red | css: computed style of g (main/g) (3) |
| `/docs/components/aria/checkbox` | green |  |
| `/docs/components/aria/code-block` | red | behaviour: not exercised: link "…" (228); behaviour: not exercised: button "…" (67); behaviour: not exercised: tab "…" (9) |
| `/docs/components/aria/collapsible` | red | behaviour: not exercised: link "…" (140); behaviour: not exercised: button "…" (after click button "…") (16); behaviour: click button "…" (14) |
| `/docs/components/aria/combobox` | red | behaviour: not exercised: link "…" (171); behaviour: click button "…" (20); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/command` | red | behaviour: not exercised: link "…" (151); behaviour: not exercised: menuitem "…" (after click button "…" ) (20); behaviour: click button "…" (11) |
| `/docs/components/aria/context-menu` | red | behaviour: not exercised: link "…" (62); behaviour: click button "…" (12); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/data-table` | red | behaviour: not exercised: link "…" (220); behaviour: not exercised: button "…" (37); rendered: accessibility tree (36) |
| `/docs/components/aria/date-picker` | red | behaviour: not exercised: button "…" (after click button "…") (141); behaviour: not exercised: link "…" (55); behaviour: click button "…" (17) |
| `/docs/components/aria/dialog` | green |  |
| `/docs/components/aria/direction` | green |  |
| `/docs/components/aria/drawer` | red | behaviour: not exercised: link "…" (165); behaviour: not exercised: button "…" (30); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/dropdown-menu` | green |  |
| `/docs/components/aria/empty` | green |  |
| `/docs/components/aria/field` | red | behaviour: not exercised: link "…" (209); behaviour: not exercised: button "…" (45); behaviour: not exercised: textbox "…" (15) |
| `/docs/components/aria/hover-card` | green |  |
| `/docs/components/aria/input` | red | behaviour: not exercised: link "…" (144); behaviour: click button "…" (17); motion: type "…" into textbox "…": extra motion of link "…" (main>link/a) (9) |
| `/docs/components/aria/input-group` | green |  |
| `/docs/components/aria/input-otp` | red | css: computed style of generic (main/div) (2); navigation: back to /docs/components/aria/input-otp after going in place from /doc (2); css: computed style of group (main>group/div) |
| `/docs/components/aria/item` | green |  |
| `/docs/components/aria/kbd` | green |  |
| `/docs/components/aria/label` | green |  |
| `/docs/components/aria/marker` | green |  |
| `/docs/components/aria/message` | red | behaviour: not exercised: link "…" (179); behaviour: not exercised: button "…" (12); behaviour: not exercised: link "…", shared with / (8) |
| `/docs/components/aria/message-scroller` | red | behaviour: not exercised: link "…" (187); behaviour: not exercised: button "…" (52); css: computed style of region "…" (main>region/div) (12) |
| `/docs/components/aria/native-select` | red | behaviour: not exercised: link "…" (137); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/components/aria/pagination` | red | behaviour: not exercised: link "…" (61); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (6) |
| `/docs/components/aria/popover` | green |  |
| `/docs/components/aria/progress` | green |  |
| `/docs/components/aria/questionnaire` | red | http: the check of this route |
| `/docs/components/aria/radio-group` | red | behaviour: not exercised: link "…" (70); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (8) |
| `/docs/components/aria/resizable` | green |  |
| `/docs/components/aria/scroll-area` | green |  |
| `/docs/components/aria/select` | red | behaviour: not exercised: option "…" (after click button "…") (59); behaviour: click button "…" (14); behaviour: not exercised: clickable "…" (after click button "…") (9) |
| `/docs/components/aria/separator` | green |  |
| `/docs/components/aria/sheet` | green |  |
| `/docs/components/aria/sidebar` | red | behaviour: not exercised: link "…" (202); behaviour: not exercised: button "…" (19); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/skeleton` | green |  |
| `/docs/components/aria/slider` | red | css: computed style of group "…" (main>group/div) (5); css: computed style of generic (main/div) (3) |
| `/docs/components/aria/sonner` | green |  |
| `/docs/components/aria/spinner` | green |  |
| `/docs/components/aria/switch` | red | behaviour: not exercised: link "…" (42); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (8) |
| `/docs/components/aria/table` | green |  |
| `/docs/components/aria/tabs` | green |  |
| `/docs/components/aria/textarea` | green |  |
| `/docs/components/aria/toast` | green |  |
| `/docs/components/aria/toggle` | green |  |
| `/docs/components/aria/toggle-group` | red | behaviour: not exercised: link "…" (164); behaviour: not exercised: radio "…" (21); behaviour: click button "…" (10) |
| `/docs/components/aria/tooltip` | green |  |
| `/docs/components/aria/trace` | red | behaviour: not exercised: link "…" (221); behaviour: not exercised: button "…" (51); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/aria/typography` | red | behaviour: not exercised: link "…" (130); behaviour: not exercised: link "…", shared with / (9); motion: click button "…" : extra motion of link "…" (main>link/a) (3) |
| `/docs/components/attachment` | green |  |
| `/docs/components/base/accordion` | red | behaviour: not exercised: link "…" (120); behaviour: click button "…" (9); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/alert` | green |  |
| `/docs/components/base/alert-dialog` | red | behaviour: not exercised: link "…" (146); behaviour: click button "…" (16); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/aspect-ratio` | green |  |
| `/docs/components/base/attachment` | green |  |
| `/docs/components/base/avatar` | green |  |
| `/docs/components/base/badge` | green |  |
| `/docs/components/base/breadcrumb` | red | behaviour: not exercised: link "…" (88); behaviour: click button "…" (10); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/bubble` | red | behaviour: not exercised: link "…" (176); behaviour: not exercised: button "…" (27); behaviour: not exercised: link "…", shared with / (8) |
| `/docs/components/base/button` | green |  |
| `/docs/components/base/button-group` | red | behaviour: not exercised: link "…" (184); behaviour: not exercised: button "…" (35); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/calendar` | red | behaviour: not exercised: button "…" (458); behaviour: not exercised: link "…" (180); behaviour: not exercised: row "…" (24) |
| `/docs/components/base/card` | red | behaviour: not exercised: link "…" (177); behaviour: not exercised: button "…" (16); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/carousel` | red | css: computed style of generic (main/div) (2); css: computed style of generic (main>region/div) |
| `/docs/components/base/chart` | red | css: computed style of g (main/g) (3) |
| `/docs/components/base/checkbox` | red | behaviour: not exercised: link "…" (49); behaviour: not exercised: checkbox "…" (13); behaviour: click button "…" (9) |
| `/docs/components/base/code-block` | green |  |
| `/docs/components/base/collapsible` | red | behaviour: not exercised: link "…" (162); behaviour: not exercised: button "…" (after click button "…") (16); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/combobox` | red | behaviour: not exercised: link "…" (186); behaviour: not exercised: option "…" (after click combobox "…") (43); behaviour: not exercised: button "…" (9) |
| `/docs/components/base/command` | red | behaviour: not exercised: link "…" (127); behaviour: not exercised: option "…" (after click button "…" ) (17); behaviour: click button "…" (10) |
| `/docs/components/base/context-menu` | red | behaviour: click button "…" (12); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/base/data-table` | red | behaviour: not exercised: link "…" (221); behaviour: not exercised: button "…" (39); rendered: accessibility tree (36) |
| `/docs/components/base/date-picker` | green |  |
| `/docs/components/base/dialog` | green |  |
| `/docs/components/base/direction` | green |  |
| `/docs/components/base/drawer` | green |  |
| `/docs/components/base/dropdown-menu` | green |  |
| `/docs/components/base/empty` | green |  |
| `/docs/components/base/field` | red | behaviour: not exercised: link "…" (214); behaviour: not exercised: option "…" (after click combobox "…") (33); behaviour: not exercised: button "…" (27) |
| `/docs/components/base/hover-card` | red | behaviour: not exercised: link "…" (52); behaviour: click button "…" (11); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/input` | green |  |
| `/docs/components/base/input-group` | red | behaviour: not exercised: link "…" (188); behaviour: not exercised: button "…" (36); behaviour: not exercised: clickable "…" (15) |
| `/docs/components/base/input-otp` | red | navigation: in place from / (through a link the checker added: no page links here) (5); navigation: in place from /blocks (through a link the checker added: no page links (5); css: computed style of generic (main/div) (2) |
| `/docs/components/base/item` | green |  |
| `/docs/components/base/kbd` | green |  |
| `/docs/components/base/label` | red | behaviour: not exercised: option "…" (after click combobox "…") (20); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/components/base/marker` | green |  |
| `/docs/components/base/menubar` | red | behaviour: not exercised: link "…" (33); behaviour: not exercised: menuitem "…" (16); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/message` | green |  |
| `/docs/components/base/message-scroller` | red | behaviour: not exercised: link "…" (189); behaviour: not exercised: button "…" (53); css: computed style of region "…" (main>region/div) (12) |
| `/docs/components/base/native-select` | green |  |
| `/docs/components/base/navigation-menu` | red | behaviour: click button "…", then click link "…" (step 1) (24); behaviour: click button "…" (9); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/pagination` | red | behaviour: not exercised: link "…" (75); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/components/base/popover` | green |  |
| `/docs/components/base/progress` | green |  |
| `/docs/components/base/questionnaire` | red | css: computed style of generic (main>form>group/div) |
| `/docs/components/base/radio-group` | red | behaviour: not exercised: link "…" (41); behaviour: not exercised: radio "…" (20); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/resizable` | green |  |
| `/docs/components/base/scroll-area` | red | navigation: in place from / (through a link the checker added: no page links here) (3); navigation: in place from /blocks (through a link the checker added: no page links (3); css: computed style of generic (main/div) |
| `/docs/components/base/select` | red | behaviour: not exercised: link "…" (61); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (8) |
| `/docs/components/base/separator` | green |  |
| `/docs/components/base/sheet` | red | behaviour: click button "…" (12); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: button "…" (after click button "…") (7) |
| `/docs/components/base/sidebar` | green |  |
| `/docs/components/base/skeleton` | green |  |
| `/docs/components/base/slider` | red | css: computed style of group (main>group/div) (3); css: computed style of generic (main/div) |
| `/docs/components/base/spinner` | green |  |
| `/docs/components/base/switch` | green |  |
| `/docs/components/base/table` | green |  |
| `/docs/components/base/tabs` | green |  |
| `/docs/components/base/textarea` | green |  |
| `/docs/components/base/toast` | green |  |
| `/docs/components/base/toggle` | green |  |
| `/docs/components/base/toggle-group` | red | rendered: accessibility tree (2); css: computed style of button "…" (main>group>group>button/button) |
| `/docs/components/base/tooltip` | red | behaviour: not exercised: link "…" (38); behaviour: click button "…" (12); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/trace` | red | behaviour: not exercised: link "…" (218); behaviour: not exercised: button "…" (45); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/base/typography` | green |  |
| `/docs/components/breadcrumb` | green |  |
| `/docs/components/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (main>link/span) (2); css: computed style of generic (main/div) |
| `/docs/components/button` | green |  |
| `/docs/components/button-group` | green |  |
| `/docs/components/calendar` | red | rendered: accessibility tree (11) |
| `/docs/components/chart` | red | css: computed style of g (main/g) (3) |
| `/docs/components/collapsible` | green |  |
| `/docs/components/data-table` | red | rendered: accessibility tree (18); css: computed style of generic (main/div) (5); css: computed style of button "…" (main>button/button) (3) |
| `/docs/components/input-group` | green |  |
| `/docs/components/input-otp` | red | css: computed style of generic (main/div) (2); css: computed style of group (main>group/div) |
| `/docs/components/marker` | green |  |
| `/docs/components/message` | green |  |
| `/docs/components/message-scroller` | red | css: computed style of region "…" (main>region/div) (6); css: computed style of generic (main>form>group>group>group/div) |
| `/docs/components/popover` | green |  |
| `/docs/components/radix/accordion` | green |  |
| `/docs/components/radix/alert` | green |  |
| `/docs/components/radix/alert-dialog` | green |  |
| `/docs/components/radix/aspect-ratio` | green |  |
| `/docs/components/radix/attachment` | green |  |
| `/docs/components/radix/avatar` | red | rendered: accessibility tree (20); rendered: visible text (20); assets: image https://github.com/shadcn.png (13) |
| `/docs/components/radix/badge` | green |  |
| `/docs/components/radix/breadcrumb` | green |  |
| `/docs/components/radix/bubble` | red | rendered: visible text (2); css: computed style of generic "…" (main>link/span) (2); css: computed style of generic (main/div) |
| `/docs/components/radix/button` | green |  |
| `/docs/components/radix/button-group` | red | behaviour: not exercised: link "…" (185); behaviour: not exercised: button "…" (34); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/radix/calendar` | red | rendered: accessibility tree (11) |
| `/docs/components/radix/card` | red | behaviour: not exercised: link "…" (178); behaviour: not exercised: button "…" (30); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/radix/carousel` | red | rendered: accessibility tree (2); css: computed style of generic (main/div) (2); css: computed style of button "…" (main>region>button/button) |
| `/docs/components/radix/chart` | red | css: computed style of g (main/g) (3) |
| `/docs/components/radix/checkbox` | red | rendered: accessibility tree (3); css: computed style of checkbox (main>table>rowgroup>row>cell>checkbox/butt |
| `/docs/components/radix/code-block` | green |  |
| `/docs/components/radix/collapsible` | green |  |
| `/docs/components/radix/combobox` | green |  |
| `/docs/components/radix/command` | green |  |
| `/docs/components/radix/context-menu` | red | behaviour: not exercised: link "…" (32); behaviour: click button "…" (11); behaviour: not exercised: clickable "…" (10) |
| `/docs/components/radix/data-table` | red | rendered: accessibility tree (18); css: computed style of generic (main/div) (5); css: computed style of button "…" (main>button/button) (3) |
| `/docs/components/radix/date-picker` | green |  |
| `/docs/components/radix/dialog` | green |  |
| `/docs/components/radix/direction` | green |  |
| `/docs/components/radix/drawer` | red | behaviour: not exercised: link "…" (133); behaviour: click button "…" (14); behaviour: not exercised: clickable <g> in dialog>application (no name: matched b (14) |
| `/docs/components/radix/dropdown-menu` | red | rendered: accessibility tree (3); rendered: visible text; a11y: axe color-contrast: Elements must meet minimum color contrast ratio th |
| `/docs/components/radix/empty` | red | rendered: accessibility tree (7); rendered: visible text (4); assets: image https://github.com/shadcn.png (2) |
| `/docs/components/radix/field` | red | behaviour: not exercised: link "…" (215); behaviour: not exercised: button "…" (34); behaviour: not exercised: option "…" (after click combobox "…") (32) |
| `/docs/components/radix/hover-card` | green |  |
| `/docs/components/radix/input` | red | behaviour: not exercised: link "…" (178); behaviour: not exercised: button "…" (23); motion: type "…" into textbox "…": extra motion of link "…" (main>link/a) (9) |
| `/docs/components/radix/input-group` | green |  |
| `/docs/components/radix/input-otp` | red | css: computed style of generic (main/div) (2); css: computed style of group (main>group/div) |
| `/docs/components/radix/item` | red | css: computed style of link "…" (main>link/a) (2) |
| `/docs/components/radix/kbd` | green |  |
| `/docs/components/radix/label` | red | behaviour: not exercised: link "…" (90); behaviour: not exercised: option "…" (after click combobox "…") (18); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/components/radix/marker` | green |  |
| `/docs/components/radix/menubar` | green |  |
| `/docs/components/radix/message` | green |  |
| `/docs/components/radix/message-scroller` | red | behaviour: not exercised: link "…" (190); behaviour: not exercised: button "…" (51); css: computed style of region "…" (main>region/div) (12) |
| `/docs/components/radix/native-select` | green |  |
| `/docs/components/radix/navigation-menu` | green |  |
| `/docs/components/radix/pagination` | red | behaviour: not exercised: link "…" (164); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/components/radix/popover` | green |  |
| `/docs/components/radix/progress` | red | behaviour: not exercised: link "…" (36); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (6) |
| `/docs/components/radix/questionnaire` | red | css: computed style of generic (main>form>group/div) |
| `/docs/components/radix/radio-group` | green |  |
| `/docs/components/radix/resizable` | green |  |
| `/docs/components/radix/scroll-area` | green |  |
| `/docs/components/radix/select` | red | behaviour: not exercised: link "…" (15); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…" (8) |
| `/docs/components/radix/separator` | green |  |
| `/docs/components/radix/sheet` | green |  |
| `/docs/components/radix/sidebar` | green |  |
| `/docs/components/radix/skeleton` | green |  |
| `/docs/components/radix/slider` | red | css: computed style of generic (main/span) (5); css: computed style of generic (main/div) (3) |
| `/docs/components/radix/sonner` | green |  |
| `/docs/components/radix/spinner` | green |  |
| `/docs/components/radix/switch` | green |  |
| `/docs/components/radix/table` | green |  |
| `/docs/components/radix/tabs` | green |  |
| `/docs/components/radix/textarea` | green |  |
| `/docs/components/radix/toast` | green |  |
| `/docs/components/radix/toggle` | green |  |
| `/docs/components/radix/toggle-group` | red | behaviour: not exercised: link "…" (29); behaviour: not exercised: radio "…" (21); behaviour: click button "…" (9) |
| `/docs/components/radix/tooltip` | green |  |
| `/docs/components/radix/trace` | green |  |
| `/docs/components/radix/typography` | green |  |
| `/docs/components/scroll-area` | red | css: computed style of generic (main/div) |
| `/docs/components/select` | green |  |
| `/docs/components/spinner` | green |  |
| `/docs/components/tooltip` | green |  |
| `/docs/dark-mode` | green |  |
| `/docs/dark-mode/astro` | green |  |
| `/docs/dark-mode/next` | green |  |
| `/docs/dark-mode/remix` | green |  |
| `/docs/dark-mode/tanstack-start` | green |  |
| `/docs/dark-mode/vite` | green |  |
| `/docs/directory` | green |  |
| `/docs/directory?page=10` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (9) |
| `/docs/directory?page=11` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (8) |
| `/docs/directory?page=12` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (11) |
| `/docs/directory?page=13` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (6) |
| `/docs/directory?page=14` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (9) |
| `/docs/directory?page=15` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (12) |
| `/docs/directory?page=16` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (9) |
| `/docs/directory?page=17` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (12) |
| `/docs/directory?page=18` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (10) |
| `/docs/directory?page=19` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (8) |
| `/docs/directory?page=2` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (11) |
| `/docs/directory?page=20` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (14) |
| `/docs/directory?page=21` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (5) |
| `/docs/directory?page=22` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (12) |
| `/docs/directory?page=23` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (8) |
| `/docs/directory?page=24` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (13) |
| `/docs/directory?page=25` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>link/path) (8) |
| `/docs/directory?page=26` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list>link/path) (6) |
| `/docs/directory?page=27` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (11) |
| `/docs/directory?page=28` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (10) |
| `/docs/directory?page=29` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (8) |
| `/docs/directory?page=3` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (10) |
| `/docs/directory?page=30` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (9) |
| `/docs/directory?page=31` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (8) |
| `/docs/directory?page=32` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (7) |
| `/docs/directory?page=33` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (8) |
| `/docs/directory?page=34` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (7) |
| `/docs/directory?page=35` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (9) |
| `/docs/directory?page=36` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (8) |
| `/docs/directory?page=37` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (8) |
| `/docs/directory?page=38` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (10) |
| `/docs/directory?page=39` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (11) |
| `/docs/directory?page=4` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (7) |
| `/docs/directory?page=40` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (13) |
| `/docs/directory?page=41` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (8) |
| `/docs/directory?page=42` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (15) |
| `/docs/directory?page=43` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (6) |
| `/docs/directory?page=44` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (12) |
| `/docs/directory?page=45` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (14) |
| `/docs/directory?page=46` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (11) |
| `/docs/directory?page=47` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (8) |
| `/docs/directory?page=48` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of path (main>list/path) (6) |
| `/docs/directory?page=5` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (8) |
| `/docs/directory?page=6` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (7) |
| `/docs/directory?page=7` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (6) |
| `/docs/directory?page=8` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (7) |
| `/docs/directory?page=9` | red | rendered: accessibility tree (20); rendered: visible text (20); css: computed style of generic (main>list/div) (6) |
| `/docs/figma` | green |  |
| `/docs/forms` | green |  |
| `/docs/forms/formisch` | red | behaviour: not exercised: link "…" (195); behaviour: not exercised: button "…" (54); rendered: accessibility tree (16) |
| `/docs/forms/next` | red | behaviour: not exercised: link "…" (187); rendered: accessibility tree (40); behaviour: not exercised: button "…" (31) |
| `/docs/forms/react-hook-form` | red | rendered: accessibility tree (8); css: computed style of generic "…" (main>link/span) (2); css: computed style of checkbox (main>form>group>checkbox/input) (2) |
| `/docs/forms/tanstack-form` | red | rendered: accessibility tree (8); css: computed style of generic "…" (main>link/span) (2); css: computed style of checkbox (main>form>group>checkbox/input) (2) |
| `/docs/helpers/ai-sdk` | red | behaviour: not exercised: link "…" (237); behaviour: not exercised: button "…" (34); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/helpers/tanstack-ai` | green |  |
| `/docs/installation` | green |  |
| `/docs/installation/astro` | green |  |
| `/docs/installation/gatsby` | green |  |
| `/docs/installation/laravel` | green |  |
| `/docs/installation/manual` | red | behaviour: not exercised: link "…" (79); rendered: visible text (20); rendered: accessibility tree (16) |
| `/docs/installation/next` | green |  |
| `/docs/installation/react-router` | green |  |
| `/docs/installation/remix` | green |  |
| `/docs/installation/tanstack` | green |  |
| `/docs/installation/tanstack-router` | green |  |
| `/docs/installation/vite` | green |  |
| `/docs/javascript` | green |  |
| `/docs/legacy` | green |  |
| `/docs/mcp` | green |  |
| `/docs/monorepo` | green |  |
| `/docs/new` | green |  |
| `/docs/official` | green |  |
| `/docs/package-imports` | green |  |
| `/docs/react-19` | red | behaviour: not exercised: link "…" (98); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: menuitem "…" (after click button) (5) |
| `/docs/react/message-scroller` | green |  |
| `/docs/react/questionnaire` | red | http: the check of this route |
| `/docs/registry` | green |  |
| `/docs/registry/api-reference` | green |  |
| `/docs/registry/authentication` | green |  |
| `/docs/registry/dynamic-search` | green |  |
| `/docs/registry/examples` | red | rendered: visible text |
| `/docs/registry/faq` | green |  |
| `/docs/registry/getting-started` | red | behaviour: not exercised: link "…" (143); behaviour: not exercised: tab "…" (56); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/registry/github` | green |  |
| `/docs/registry/health` | green |  |
| `/docs/registry/mcp` | green |  |
| `/docs/registry/namespace` | green |  |
| `/docs/registry/open-in-v0` | green |  |
| `/docs/registry/registry-index` | green |  |
| `/docs/registry/registry-item-json` | red | rendered: visible text |
| `/docs/registry/registry-json` | green |  |
| `/docs/rtl` | green |  |
| `/docs/rtl/next` | green |  |
| `/docs/rtl/start` | green |  |
| `/docs/rtl/vite` | green |  |
| `/docs/skills` | green |  |
| `/docs/tailwind-v4` | green |  |
| `/docs/theming` | red | behaviour: not exercised: link "…" (83); rendered: accessibility tree (16); behaviour: not exercised: link "…", shared with / (9) |
| `/docs/typeset` | green |  |
| `/docs/utils/scroll-fade` | green |  |
| `/docs/utils/shimmer` | green |  |
| `/examples/authentication` | red | behaviour: not exercised: link "…", shared with / (9); behaviour: click combobox "…", then click option "…" (step 1) (8); behaviour: click combobox "…", then press Enter on option "…" (step 1) (8) |
| `/examples/dashboard` | not checked | infrastructure |
| `/examples/playground` | red | behaviour: click combobox "…", then click option "…" (step 1) (25); behaviour: not exercised: link "…", shared with / (9); behaviour: click button "…", closed by a click outside it (5) |
| `/examples/rtl` | not checked | infrastructure |
| `/examples/tasks` | red | behaviour: click button "…" (35); behaviour: click checkbox "…" (26); behaviour: click button "…", then click menuitem "…" (step 1) (13) |
| `/preview/typeset/docs` | red | weight: JavaScript downloaded; rendered: fresh load: <html> class and data-* attributes |
| `/sera` | red | behaviour: not exercised: button "…" (after click button "…", then click button " (15); behaviour: click button "…", then click button "…" (step 1) (13); css: computed style of checkbox (main>table>rowgroup>row>cell>checkbox/inpu (11) |
| `/skills` | red | behaviour: not exercised: link "…" (31); behaviour: not exercised: link "…", shared with / (9); behaviour: not exercised: tab "…" (4) |
| `/typeset` | red | network: browser request missing |
| `/view/aria-nova/sidebar-rtl` | red | behaviour: click combobox, then click option "…", then click button "…", then cli (28); behaviour: click combobox, then click option "…", then click button "…" (step 1) (16); behaviour: click combobox, then click option "…", then press Enter on button "…"  (16) |
| `/view/base-nova/sidebar-rtl` | red | behaviour: click combobox, then click option "…", then click button "…", then pre (48); behaviour: click combobox, then click option "…", then click button "…", then cli (28); behaviour: click combobox, then click option "…", then click button "…" (step 1) (16) |
| `/view/new-york-v4/dashboard-01` | red | behaviour: click button "…" (24); behaviour: not exercised: button "…" (after click button "…") (22); rendered: visible text (14) |
| `/view/new-york-v4/login-01` | green |  |
| `/view/new-york-v4/login-02` | green |  |
| `/view/new-york-v4/login-03` | green |  |
| `/view/new-york-v4/login-04` | green |  |
| `/view/new-york-v4/login-05` | green |  |
| `/view/new-york-v4/sidebar-01` | red | behaviour: click button "…", then click menuitem "…", then click button "…", clos (4); behaviour: click button "…", then click menuitem "…" (step 1) (3); behaviour: click button "…", then press Enter on menuitem "…" (step 1) (3) |
| `/view/new-york-v4/sidebar-02` | red | behaviour: click button "…" (6); a11y: press Enter on button "…" (6); a11y: press Space on button "…" (6) |
| `/view/new-york-v4/sidebar-03` | green |  |
| `/view/new-york-v4/sidebar-04` | green |  |
| `/view/new-york-v4/sidebar-05` | red | motion: press Enter on button "…" , with prefers-reduced-motion: reduce: motio (3); motion: click button "…" : motion of generic (body/div) (2); motion: click button "…" , with prefers-reduced-motion: reduce: motion of gene (2) |
| `/view/new-york-v4/sidebar-06` | green |  |
| `/view/new-york-v4/sidebar-07` | red | behaviour: click button "…", then click menuitem "…" (step 1) (12); behaviour: click button "…", then press Enter on menuitem "…" (step 1) (10); behaviour: click button "…", then press Space on menuitem "…" (step 1) (10) |
| `/view/new-york-v4/sidebar-08` | green |  |
| `/view/new-york-v4/sidebar-09` | red | rendered: visible text (20); behaviour: click button "…" (6); a11y: press Enter on button "…" (6) |
| `/view/new-york-v4/sidebar-10` | red | behaviour: click button "…" (15); a11y: press Enter on button "…" (15); a11y: press Space on button "…" (15) |
| `/view/new-york-v4/sidebar-11` | red | behaviour: click button "…", then click button "…", then click button "…", then p (8); motion: click button "…", with prefers-reduced-motion: reduce: motion of svg ( (5); behaviour: click button "…", then click button "…", then click button "…" (step 2 (4) |
| `/view/new-york-v4/sidebar-12` | red | behaviour: click button "…" (6); a11y: press Enter on button "…" (6); a11y: press Space on button "…" (6) |
| `/view/new-york-v4/sidebar-13` | red | behaviour: click link "…" (13); rendered: accessibility tree (4); rendered: visible text (4) |
| `/view/new-york-v4/sidebar-14` | green |  |
| `/view/new-york-v4/sidebar-15` | red | behaviour: click button "…" (16); a11y: press Enter on button "…" (16); a11y: press Space on button "…" (16) |
| `/view/new-york-v4/sidebar-16` | red | behaviour: click button "…", then click menuitem "…" (step 1) (8); behaviour: click button "…", then press Enter on menuitem "…" (step 1) (6); behaviour: click button "…", then press Space on menuitem "…" (step 1) (6) |
| `/view/new-york-v4/signup-01` | green |  |
| `/view/new-york-v4/signup-02` | green |  |
| `/view/new-york-v4/signup-03` | green |  |
| `/view/new-york-v4/signup-04` | green |  |
| `/view/new-york-v4/signup-05` | green |  |
| `/view/radix-nova/sidebar-rtl` | green |  |
| `/create?base=aria` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?preset=b27GcrRo` | red | rendered: visible text (2); css: computed style of button "…" (dialog>button/button); css: computed style of path (main>button>img/path) |
| `/create?preset=b2D0wqNxT` | red | rendered: visible text (8); css: computed style of path (main>button/path) (2); css: computed style of generic (main>button/div) (2) |
| `/create?preset=b4xFeBLg4O` | red | rendered: visible text (8); css: computed style of generic (main>button/div) (3); css: computed style of button "…" (dialog>button/button) |
| `/create?template=astro` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?template=laravel` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?template=next` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 2 |
| `/create?template=next&base=base&rtl=true` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?template=react-router` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?template=start` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?template=start&base=base&rtl=true` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?template=vite` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/create?template=vite&base=base&rtl=true` | red | css: computed style of button "…" (dialog>button/button); a11y: focus order (Tab), first difference at stop 1 |
| `/docs/ai-sdk-ui/chatbot-tool-usage` | red | rendered: accessibility tree (6); a11y: landmarks (2); weight: JavaScript downloaded |
| `/docs/blocks` | red | rendered: accessibility tree (3); a11y: landmarks (2); weight: JavaScript downloaded |
| `/login` | red | rendered: accessibility tree (6); a11y: landmarks (2); weight: JavaScript downloaded |
| `/privacy` | red | rendered: accessibility tree (3); a11y: landmarks (2); weight: JavaScript downloaded |
| `/terms` | red | rendered: accessibility tree (3); a11y: landmarks (2); weight: JavaScript downloaded |
| `/markless-migrate-no-such-page` | red | rendered: accessibility tree (3); a11y: landmarks (2); weight: JavaScript downloaded |
| `/api/search` | green |  |
| `/llm` | red | http: status; http: content-type |
| `/og` | red | data: line (40) |
| `/r/registries.json` | green |  |
| `/robots.txt` | green |  |
| `/rss.xml` | green |  |
| `/site.webmanifest` | green |  |
| `/sitemap.xml` | green |  |
| `/typeset.css` | green |  |
| `/llms.txt` | green |  |
| `/blocks/` | green |  |
| `/blocks/authentication/` | green |  |
| `/blocks/dashboard/` | green |  |
| `/blocks/login/` | green |  |
| `/blocks/sidebar/` | green |  |
| `/blocks/signup/` | green |  |
| `/charts/` | green |  |
| `/charts/area/` | green |  |
| `/charts/bar/` | green |  |
| `/charts/line/` | green |  |
| `/charts/pie/` | green |  |
| `/charts/radar/` | green |  |
| `/charts/radial/` | green |  |
| `/charts/tooltip/` | green |  |
| `/cli/` | green |  |
| `/colors/` | green |  |
| `/components/` | green |  |
| `/create/` | green |  |
| `/directory` | green |  |
| `/docs/` | green |  |
| `/docs/_blocks/` | green |  |
| `/docs/_v0/` | green |  |
| `/docs/ai-elements/` | green |  |
| `/docs/ai-elements/aria/chain-of-thought/` | green |  |
| `/docs/ai-elements/aria/chat/` | green |  |
| `/docs/ai-elements/aria/checkpoint/` | green |  |
| `/docs/ai-elements/aria/confirmation/` | green |  |
| `/docs/ai-elements/aria/context/` | green |  |
| `/docs/ai-elements/aria/file-tree/` | green |  |
| `/docs/ai-elements/aria/inline-citation/` | green |  |
| `/docs/ai-elements/aria/message/` | green |  |
| `/docs/ai-elements/aria/model-selector/` | green |  |
| `/docs/ai-elements/aria/plan/` | green |  |
| `/docs/ai-elements/aria/prompt-input/` | green |  |
| `/docs/ai-elements/aria/queue/` | green |  |
| `/docs/ai-elements/aria/reasoning/` | green |  |
| `/docs/ai-elements/aria/sources/` | green |  |
| `/docs/ai-elements/aria/stack-trace/` | green |  |
| `/docs/ai-elements/aria/subagent/` | green |  |
| `/docs/ai-elements/aria/suggestion/` | green |  |
| `/docs/ai-elements/aria/task/` | green |  |
| `/docs/ai-elements/aria/terminal/` | green |  |
| `/docs/ai-elements/aria/test-results/` | green |  |
| `/docs/ai-elements/aria/tool/` | green |  |
| `/docs/ai-elements/base/chain-of-thought/` | green |  |
| `/docs/ai-elements/base/chat/` | green |  |
| `/docs/ai-elements/base/checkpoint/` | green |  |
| `/docs/ai-elements/base/confirmation/` | green |  |
| `/docs/ai-elements/base/context/` | green |  |
| `/docs/ai-elements/base/file-tree/` | green |  |
| `/docs/ai-elements/base/inline-citation/` | green |  |
| `/docs/ai-elements/base/message/` | green |  |
| `/docs/ai-elements/base/model-selector/` | green |  |
| `/docs/ai-elements/base/plan/` | green |  |
| `/docs/ai-elements/base/prompt-input/` | green |  |
| `/docs/ai-elements/base/queue/` | green |  |
| `/docs/ai-elements/base/reasoning/` | green |  |
| `/docs/ai-elements/base/sources/` | green |  |
| `/docs/ai-elements/base/stack-trace/` | green |  |
| `/docs/ai-elements/base/subagent/` | green |  |
| `/docs/ai-elements/base/suggestion/` | green |  |
| `/docs/ai-elements/base/task/` | green |  |
| `/docs/ai-elements/base/terminal/` | green |  |
| `/docs/ai-elements/base/test-results/` | green |  |
| `/docs/ai-elements/base/tool/` | green |  |
| `/docs/ai-elements/radix/chain-of-thought/` | green |  |
| `/docs/ai-elements/radix/chat/` | green |  |
| `/docs/ai-elements/radix/checkpoint/` | green |  |
| `/docs/ai-elements/radix/confirmation/` | green |  |
| `/docs/ai-elements/radix/context/` | green |  |
| `/docs/ai-elements/radix/file-tree/` | green |  |
| `/docs/ai-elements/radix/inline-citation/` | green |  |
| `/docs/ai-elements/radix/message/` | green |  |
| `/docs/ai-elements/radix/model-selector/` | green |  |
| `/docs/ai-elements/radix/plan/` | green |  |
| `/docs/ai-elements/radix/prompt-input/` | green |  |
| `/docs/ai-elements/radix/queue/` | green |  |
| `/docs/ai-elements/radix/reasoning/` | green |  |
| `/docs/ai-elements/radix/sources/` | green |  |
| `/docs/ai-elements/radix/stack-trace/` | green |  |
| `/docs/ai-elements/radix/subagent/` | green |  |
| `/docs/ai-elements/radix/suggestion/` | green |  |
| `/docs/ai-elements/radix/task/` | green |  |
| `/docs/ai-elements/radix/terminal/` | green |  |
| `/docs/ai-elements/radix/test-results/` | green |  |
| `/docs/ai-elements/radix/tool/` | green |  |
| `/docs/ai-sdk-ui/chatbot-tool-usage/` | green |  |
| `/docs/blocks/` | green |  |
| `/docs/changelog/` | green |  |
| `/docs/changelog/2023-06-new-cli/` | green |  |
| `/docs/changelog/2023-07-javascript/` | green |  |
| `/docs/changelog/2023-12-new-components/` | green |  |
| `/docs/changelog/2024-03-blocks/` | green |  |
| `/docs/changelog/2024-03-breadcrumb-otp/` | green |  |
| `/docs/changelog/2024-04-lift-mode/` | green |  |
| `/docs/changelog/2024-08-npx-shadcn-init/` | green |  |
| `/docs/changelog/2024-10-react-19/` | green |  |
| `/docs/changelog/2024-10-sidebar/` | green |  |
| `/docs/changelog/2024-11-icons/` | green |  |
| `/docs/changelog/2024-12-monorepo/` | green |  |
| `/docs/changelog/2025-01-blocks/` | green |  |
| `/docs/changelog/2025-02-registry-schema/` | green |  |
| `/docs/changelog/2025-02-tailwind-v4/` | green |  |
| `/docs/changelog/2025-04-cross-framework/` | green |  |
| `/docs/changelog/2025-04-mcp/` | green |  |
| `/docs/changelog/2025-04-shadcn-2-5/` | green |  |
| `/docs/changelog/2025-05-new-site/` | green |  |
| `/docs/changelog/2025-06-calendar/` | green |  |
| `/docs/changelog/2025-06-radix-ui/` | green |  |
| `/docs/changelog/2025-07-local-file-support/` | green |  |
| `/docs/changelog/2025-07-universal-registry/` | green |  |
| `/docs/changelog/2025-08-cli-3-mcp/` | green |  |
| `/docs/changelog/2025-09-registry-index/` | green |  |
| `/docs/changelog/2025-10-new-components/` | green |  |
| `/docs/changelog/2025-10-registry-directory/` | green |  |
| `/docs/changelog/2025-12-shadcn-create/` | green |  |
| `/docs/changelog/2026-01-base-ui/` | green |  |
| `/docs/changelog/2026-01-inline-side-styles/` | green |  |
| `/docs/changelog/2026-01-rtl/` | green |  |
| `/docs/changelog/2026-02-blocks/` | green |  |
| `/docs/changelog/2026-02-radix-ui/` | green |  |
| `/docs/changelog/2026-03-cli-v4/` | green |  |
| `/docs/changelog/2026-03-luma/` | green |  |
| `/docs/changelog/2026-04-component-composition/` | green |  |
| `/docs/changelog/2026-04-partial-preset-apply/` | green |  |
| `/docs/changelog/2026-04-pointer-cursor/` | green |  |
| `/docs/changelog/2026-04-preset-commands/` | green |  |
| `/docs/changelog/2026-04-sera/` | green |  |
| `/docs/changelog/2026-04-shadcn-apply/` | green |  |
| `/docs/changelog/2026-05-package-imports-target-aliases/` | green |  |
| `/docs/changelog/2026-05-registry-include/` | green |  |
| `/docs/changelog/2026-05-rhea/` | green |  |
| `/docs/changelog/2026-05-shadcn-eject/` | green |  |
| `/docs/changelog/2026-06-chat-components/` | green |  |
| `/docs/changelog/2026-06-github-registries/` | green |  |
| `/docs/changelog/2026-07-base-ui-default/` | green |  |
| `/docs/changelog/2026-07-dynamic-search/` | green |  |
| `/docs/changelog/2026-07-helpers/` | green |  |
| `/docs/changelog/2026-07-react-aria/` | green |  |
| `/docs/changelog/2026-07-toast/` | green |  |
| `/docs/changelog/2026-07-typeset/` | green |  |
| `/docs/changelog/2026-08-helpers-human-in-the-loop/` | green |  |
| `/docs/changelog/2026-08-private-github-registries/` | green |  |
| `/docs/changelog/2026-08-questionnaire/` | green |  |
| `/docs/changelog/2026-09-cn/` | green |  |
| `/docs/changelog/2026-10-ai-elements/` | green |  |
| `/docs/cli/` | green |  |
| `/docs/components-json/` | green |  |
| `/docs/components/` | green |  |
| `/docs/components/aria/accordion/` | green |  |
| `/docs/components/aria/alert-dialog/` | green |  |
| `/docs/components/aria/alert/` | green |  |
| `/docs/components/aria/aspect-ratio/` | green |  |
| `/docs/components/aria/attachment/` | green |  |
| `/docs/components/aria/avatar/` | green |  |
| `/docs/components/aria/badge/` | green |  |
| `/docs/components/aria/breadcrumb/` | green |  |
| `/docs/components/aria/bubble/` | green |  |
| `/docs/components/aria/button-group/` | green |  |
| `/docs/components/aria/button/` | green |  |
| `/docs/components/aria/calendar/` | green |  |
| `/docs/components/aria/card/` | green |  |
| `/docs/components/aria/carousel/` | green |  |
| `/docs/components/aria/chart/` | green |  |
| `/docs/components/aria/checkbox/` | green |  |
| `/docs/components/aria/code-block/` | green |  |
| `/docs/components/aria/collapsible/` | green |  |
| `/docs/components/aria/combobox/` | green |  |
| `/docs/components/aria/command/` | green |  |
| `/docs/components/aria/context-menu/` | green |  |
| `/docs/components/aria/data-table/` | green |  |
| `/docs/components/aria/date-picker/` | green |  |
| `/docs/components/aria/dialog/` | green |  |
| `/docs/components/aria/direction/` | green |  |
| `/docs/components/aria/drawer/` | green |  |
| `/docs/components/aria/dropdown-menu/` | green |  |
| `/docs/components/aria/empty/` | green |  |
| `/docs/components/aria/field/` | green |  |
| `/docs/components/aria/form` | green |  |
| `/docs/components/aria/hover-card/` | green |  |
| `/docs/components/aria/input-group/` | green |  |
| `/docs/components/aria/input-otp/` | green |  |
| `/docs/components/aria/input/` | green |  |
| `/docs/components/aria/item/` | green |  |
| `/docs/components/aria/kbd/` | green |  |
| `/docs/components/aria/label/` | green |  |
| `/docs/components/aria/marker/` | green |  |
| `/docs/components/aria/message-scroller/` | green |  |
| `/docs/components/aria/message/` | green |  |
| `/docs/components/aria/native-select/` | green |  |
| `/docs/components/aria/pagination/` | green |  |
| `/docs/components/aria/popover/` | green |  |
| `/docs/components/aria/progress/` | green |  |
| `/docs/components/aria/questionnaire/` | green |  |
| `/docs/components/aria/radio-group/` | green |  |
| `/docs/components/aria/resizable/` | green |  |
| `/docs/components/aria/scroll-area/` | green |  |
| `/docs/components/aria/select/` | green |  |
| `/docs/components/aria/separator/` | green |  |
| `/docs/components/aria/sheet/` | green |  |
| `/docs/components/aria/sidebar/` | green |  |
| `/docs/components/aria/skeleton/` | green |  |
| `/docs/components/aria/slider/` | green |  |
| `/docs/components/aria/sonner/` | green |  |
| `/docs/components/aria/spinner/` | green |  |
| `/docs/components/aria/switch/` | green |  |
| `/docs/components/aria/table/` | green |  |
| `/docs/components/aria/tabs/` | green |  |
| `/docs/components/aria/textarea/` | green |  |
| `/docs/components/aria/toast/` | green |  |
| `/docs/components/aria/toggle-group/` | green |  |
| `/docs/components/aria/toggle/` | green |  |
| `/docs/components/aria/tooltip/` | green |  |
| `/docs/components/aria/trace/` | green |  |
| `/docs/components/aria/typography/` | green |  |
| `/docs/components/attachment/` | green |  |
| `/docs/components/base/accordion/` | green |  |
| `/docs/components/base/alert-dialog/` | green |  |
| `/docs/components/base/alert/` | green |  |
| `/docs/components/base/aspect-ratio/` | green |  |
| `/docs/components/base/attachment/` | green |  |
| `/docs/components/base/avatar/` | green |  |
| `/docs/components/base/badge/` | green |  |
| `/docs/components/base/breadcrumb/` | green |  |
| `/docs/components/base/bubble/` | green |  |
| `/docs/components/base/button-group/` | green |  |
| `/docs/components/base/button/` | green |  |
| `/docs/components/base/calendar/` | green |  |
| `/docs/components/base/card/` | green |  |
| `/docs/components/base/carousel/` | green |  |
| `/docs/components/base/chart/` | green |  |
| `/docs/components/base/checkbox/` | green |  |
| `/docs/components/base/code-block/` | green |  |
| `/docs/components/base/collapsible/` | green |  |
| `/docs/components/base/combobox/` | green |  |
| `/docs/components/base/command/` | green |  |
| `/docs/components/base/context-menu/` | green |  |
| `/docs/components/base/data-table/` | green |  |
| `/docs/components/base/date-picker/` | green |  |
| `/docs/components/base/dialog/` | green |  |
| `/docs/components/base/direction/` | green |  |
| `/docs/components/base/drawer/` | green |  |
| `/docs/components/base/dropdown-menu/` | green |  |
| `/docs/components/base/empty/` | green |  |
| `/docs/components/base/field/` | green |  |
| `/docs/components/base/form` | green |  |
| `/docs/components/base/hover-card/` | green |  |
| `/docs/components/base/input-group/` | green |  |
| `/docs/components/base/input-otp/` | green |  |
| `/docs/components/base/input/` | green |  |
| `/docs/components/base/item/` | green |  |
| `/docs/components/base/kbd/` | green |  |
| `/docs/components/base/label/` | green |  |
| `/docs/components/base/marker/` | green |  |
| `/docs/components/base/menubar/` | green |  |
| `/docs/components/base/message-scroller/` | green |  |
| `/docs/components/base/message/` | green |  |
| `/docs/components/base/native-select/` | green |  |
| `/docs/components/base/navigation-menu/` | green |  |
| `/docs/components/base/pagination/` | green |  |
| `/docs/components/base/popover/` | green |  |
| `/docs/components/base/progress/` | green |  |
| `/docs/components/base/questionnaire/` | green |  |
| `/docs/components/base/radio-group/` | green |  |
| `/docs/components/base/resizable/` | green |  |
| `/docs/components/base/scroll-area/` | green |  |
| `/docs/components/base/select/` | green |  |
| `/docs/components/base/separator/` | green |  |
| `/docs/components/base/sheet/` | green |  |
| `/docs/components/base/sidebar/` | green |  |
| `/docs/components/base/skeleton/` | green |  |
| `/docs/components/base/slider/` | green |  |
| `/docs/components/base/sonner` | green |  |
| `/docs/components/base/sonner.md` | green |  |
| `/docs/components/base/spinner/` | green |  |
| `/docs/components/base/switch/` | green |  |
| `/docs/components/base/table/` | green |  |
| `/docs/components/base/tabs/` | green |  |
| `/docs/components/base/textarea/` | green |  |
| `/docs/components/base/toast/` | green |  |
| `/docs/components/base/toggle-group/` | green |  |
| `/docs/components/base/toggle/` | green |  |
| `/docs/components/base/tooltip/` | green |  |
| `/docs/components/base/trace/` | green |  |
| `/docs/components/base/typography/` | green |  |
| `/docs/components/breadcrumb/` | green |  |
| `/docs/components/bubble/` | green |  |
| `/docs/components/button-group/` | green |  |
| `/docs/components/button/` | green |  |
| `/docs/components/calendar/` | green |  |
| `/docs/components/chart/` | green |  |
| `/docs/components/collapsible/` | green |  |
| `/docs/components/data-table/` | green |  |
| `/docs/components/form` | green |  |
| `/docs/components/input-group/` | green |  |
| `/docs/components/input-otp/` | green |  |
| `/docs/components/marker/` | green |  |
| `/docs/components/message-scroller/` | green |  |
| `/docs/components/message/` | green |  |
| `/docs/components/popover/` | green |  |
| `/docs/components/radix/accordion/` | green |  |
| `/docs/components/radix/alert-dialog/` | green |  |
| `/docs/components/radix/alert/` | green |  |
| `/docs/components/radix/aspect-ratio/` | green |  |
| `/docs/components/radix/attachment/` | green |  |
| `/docs/components/radix/avatar/` | green |  |
| `/docs/components/radix/badge/` | green |  |
| `/docs/components/radix/breadcrumb/` | green |  |
| `/docs/components/radix/bubble/` | green |  |
| `/docs/components/radix/button-group/` | green |  |
| `/docs/components/radix/button/` | green |  |
| `/docs/components/radix/calendar/` | green |  |
| `/docs/components/radix/card/` | green |  |
| `/docs/components/radix/carousel/` | green |  |
| `/docs/components/radix/chart/` | green |  |
| `/docs/components/radix/checkbox/` | green |  |
| `/docs/components/radix/code-block/` | green |  |
| `/docs/components/radix/collapsible/` | green |  |
| `/docs/components/radix/combobox/` | green |  |
| `/docs/components/radix/command/` | green |  |
| `/docs/components/radix/context-menu/` | green |  |
| `/docs/components/radix/data-table/` | green |  |
| `/docs/components/radix/date-picker/` | green |  |
| `/docs/components/radix/dialog/` | green |  |
| `/docs/components/radix/direction/` | green |  |
| `/docs/components/radix/drawer/` | green |  |
| `/docs/components/radix/dropdown-menu/` | green |  |
| `/docs/components/radix/empty/` | green |  |
| `/docs/components/radix/field/` | green |  |
| `/docs/components/radix/form` | green |  |
| `/docs/components/radix/hover-card/` | green |  |
| `/docs/components/radix/input-group/` | green |  |
| `/docs/components/radix/input-otp/` | green |  |
| `/docs/components/radix/input/` | green |  |
| `/docs/components/radix/item/` | green |  |
| `/docs/components/radix/kbd/` | green |  |
| `/docs/components/radix/label/` | green |  |
| `/docs/components/radix/marker/` | green |  |
| `/docs/components/radix/menubar/` | green |  |
| `/docs/components/radix/message-scroller/` | green |  |
| `/docs/components/radix/message/` | green |  |
| `/docs/components/radix/native-select/` | green |  |
| `/docs/components/radix/navigation-menu/` | green |  |
| `/docs/components/radix/pagination/` | green |  |
| `/docs/components/radix/popover/` | green |  |
| `/docs/components/radix/progress/` | green |  |
| `/docs/components/radix/questionnaire/` | green |  |
| `/docs/components/radix/radio-group/` | green |  |
| `/docs/components/radix/resizable/` | green |  |
| `/docs/components/radix/scroll-area/` | green |  |
| `/docs/components/radix/select/` | green |  |
| `/docs/components/radix/separator/` | green |  |
| `/docs/components/radix/sheet/` | green |  |
| `/docs/components/radix/sidebar/` | green |  |
| `/docs/components/radix/skeleton/` | green |  |
| `/docs/components/radix/slider/` | green |  |
| `/docs/components/radix/sonner/` | green |  |
| `/docs/components/radix/spinner/` | green |  |
| `/docs/components/radix/switch/` | green |  |
| `/docs/components/radix/table/` | green |  |
| `/docs/components/radix/tabs/` | green |  |
| `/docs/components/radix/textarea/` | green |  |
| `/docs/components/radix/toast/` | green |  |
| `/docs/components/radix/toggle-group/` | green |  |
| `/docs/components/radix/toggle/` | green |  |
| `/docs/components/radix/tooltip/` | green |  |
| `/docs/components/radix/trace/` | green |  |
| `/docs/components/radix/typography/` | green |  |
| `/docs/components/scroll-area/` | green |  |
| `/docs/components/select/` | green |  |
| `/docs/components/spinner/` | green |  |
| `/docs/components/tooltip/` | green |  |
| `/docs/dark-mode/` | green |  |
| `/docs/dark-mode/astro/` | green |  |
| `/docs/dark-mode/next/` | green |  |
| `/docs/dark-mode/remix/` | green |  |
| `/docs/dark-mode/tanstack-start/` | green |  |
| `/docs/dark-mode/vite/` | green |  |
| `/docs/directory/` | green |  |
| `/docs/figma/` | green |  |
| `/docs/forms/` | green |  |
| `/docs/forms/formisch/` | green |  |
| `/docs/forms/next/` | green |  |
| `/docs/forms/react-hook-form/` | green |  |
| `/docs/forms/tanstack-form/` | green |  |
| `/docs/helpers/ai-sdk/` | green |  |
| `/docs/helpers/tanstack-ai/` | green |  |
| `/docs/installation/` | green |  |
| `/docs/installation/astro/` | green |  |
| `/docs/installation/gatsby/` | green |  |
| `/docs/installation/laravel/` | green |  |
| `/docs/installation/manual/` | green |  |
| `/docs/installation/next/` | green |  |
| `/docs/installation/react-router/` | green |  |
| `/docs/installation/remix/` | green |  |
| `/docs/installation/tanstack-router/` | green |  |
| `/docs/installation/tanstack/` | green |  |
| `/docs/installation/vite/` | green |  |
| `/docs/javascript/` | green |  |
| `/docs/legacy/` | green |  |
| `/docs/mcp/` | green |  |
| `/docs/monorepo/` | green |  |
| `/docs/new/` | green |  |
| `/docs/official/` | green |  |
| `/docs/package-imports/` | green |  |
| `/docs/react-19/` | green |  |
| `/docs/react/message-scroller/` | green |  |
| `/docs/react/questionnaire/` | green |  |
| `/docs/registry/` | green |  |
| `/docs/registry/api-reference/` | green |  |
| `/docs/registry/authentication/` | green |  |
| `/docs/registry/dynamic-search/` | green |  |
| `/docs/registry/examples/` | green |  |
| `/docs/registry/faq/` | green |  |
| `/docs/registry/getting-started/` | green |  |
| `/docs/registry/github/` | green |  |
| `/docs/registry/health/` | green |  |
| `/docs/registry/mcp/` | green |  |
| `/docs/registry/namespace/` | green |  |
| `/docs/registry/open-in-v0/` | green |  |
| `/docs/registry/registry-index/` | green |  |
| `/docs/registry/registry-item-json/` | green |  |
| `/docs/registry/registry-json/` | green |  |
| `/docs/rtl/` | green |  |
| `/docs/rtl/next/` | green |  |
| `/docs/rtl/start/` | green |  |
| `/docs/rtl/vite/` | green |  |
| `/docs/skills/` | green |  |
| `/docs/tailwind-v4/` | green |  |
| `/docs/theming/` | green |  |
| `/docs/typeset/` | green |  |
| `/docs/utils/scroll-fade/` | green |  |
| `/docs/utils/shimmer/` | green |  |
| `/examples/authentication/` | green |  |
| `/examples/dashboard/` | green |  |
| `/examples/playground/` | green |  |
| `/examples/rtl/` | green |  |
| `/examples/tasks/` | green |  |
| `/figma` | green |  |
| `/init.md` | green |  |
| `/login/` | green |  |
| `/mcp` | green |  |
| `/new` | green |  |
| `/official` | green |  |
| `/oidc` | green |  |
| `/oidc.prefetch.rsc` | green |  |
| `/oidc.rsc` | green |  |
| `/preview/typeset/docs/` | green |  |
| `/privacy/` | green |  |
| `/react-19` | green |  |
| `/sera/` | green |  |
| `/sidebar` | green |  |
| `/skills/` | green |  |
| `/terms/` | green |  |
| `/themes` | green |  |
| `/typeset/` | green |  |
| `/view/aria-nova/sidebar-rtl/` | green |  |
| `/view/base-nova/sidebar-rtl/` | green |  |
| `/view/new-york-v4/dashboard-01/` | green |  |
| `/view/new-york-v4/login-01/` | green |  |
| `/view/new-york-v4/login-02/` | green |  |
| `/view/new-york-v4/login-03/` | green |  |
| `/view/new-york-v4/login-04/` | green |  |
| `/view/new-york-v4/login-05/` | green |  |
| `/view/new-york-v4/sidebar-01/` | green |  |
| `/view/new-york-v4/sidebar-02/` | green |  |
| `/view/new-york-v4/sidebar-03/` | green |  |
| `/view/new-york-v4/sidebar-04/` | green |  |
| `/view/new-york-v4/sidebar-05/` | green |  |
| `/view/new-york-v4/sidebar-06/` | green |  |
| `/view/new-york-v4/sidebar-07/` | green |  |
| `/view/new-york-v4/sidebar-08/` | green |  |
| `/view/new-york-v4/sidebar-09/` | green |  |
| `/view/new-york-v4/sidebar-10/` | green |  |
| `/view/new-york-v4/sidebar-11/` | green |  |
| `/view/new-york-v4/sidebar-12/` | green |  |
| `/view/new-york-v4/sidebar-13/` | green |  |
| `/view/new-york-v4/sidebar-14/` | green |  |
| `/view/new-york-v4/sidebar-15/` | green |  |
| `/view/new-york-v4/sidebar-16/` | green |  |
| `/view/new-york-v4/signup-01/` | green |  |
| `/view/new-york-v4/signup-02/` | green |  |
| `/view/new-york-v4/signup-03/` | green |  |
| `/view/new-york-v4/signup-04/` | green |  |
| `/view/new-york-v4/signup-05/` | green |  |
| `/view/radix-nova/sidebar-rtl/` | green |  |

</details>

## Open work

- The search palette's search results (`/api/search`), the remaining endpoints above, and `/og`.
- Base UI Radio, Switch, Checkbox, Dialog, AlertDialog, Toast; Radix ScrollArea, ToggleGroup, Select, Slider,
  RadioGroup; vaul; react-resizable-panels; recharts (the charts are SVG from the old page, not interactive).
- Recapture every route's reveals with signatures (only the preview routes have them) and convert all 498 pages
  once bug 1 is fixed; then `check` every route.
- check: a framework's own route announcer and the regions it moves, in what a step changes (journeys), are the old
  framework's (like the announcer already is in the accessibility tree).
- Finish the in-progress check (`check --resume`); then the nameless `click button` difference on 75 routes (the
  Copy Page menu's trigger: on the old page, opening it moves the toaster's live regions), and the controls the
  checker does not reach (`not exercised`, the most common cause).
- Rebuild on Markless main once its router fix (compiled-run/markless#140, shared layout kept on in-place
  navigation) lands.
- React Aria Components on the `/docs/components/aria/*` routes: their Select, ComboBox, Popover and Menu never open
  on the new site (`click button "United States"` appears nothing); a port is needed.
- `convert`: a control that takes itself away (View Code) also changes attributes of the container it swaps; the
  reveal capture records only the container's new content, so a site part sets `data-mobile-code-visible` today.
  Recording the container's attributes needs every route's reveals captured again.
