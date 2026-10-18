import type { LibraryClass, LibraryUsage } from './types.ts';

/** What the catalog knows about a library. Unknown libraries are classified from their own package.json. */
export interface CatalogEntry {
	readonly match: RegExp;
	readonly framework: LibraryUsage['framework'];
	readonly class: LibraryClass;
	readonly reason: string;
	readonly core?: string;
	readonly replacement?: string;
	/** Export (or `Namespace.Member` member) to `family.part`; `''` means nothing to port. */
	readonly parts?: Readonly<Record<string, string>>;
	/** Prefixes of the class names and custom properties the library writes into the page. */
	readonly tokens?: readonly string[];
	/** Importing it adds a stylesheet and no code. */
	readonly css?: boolean;
}

const radix = (name: string, parts: Record<string, string>, family: string): CatalogEntry => ({
	match: new RegExp(`^@radix-ui/react-${name}$`),
	framework: 'react',
	class: 'markless-ui',
	reason: `a React primitive; @markless/ui ${family} owns the same keyboard, focus and ARIA behaviour`,
	replacement: `@markless/ui ${family}`,
	parts,
	tokens: ['--radix-', 'data-state', 'data-side', 'data-align', 'data-orientation', 'data-disabled', 'data-highlighted', 'data-placeholder'],
});

const dialogParts = { Root: 'modal.root', Trigger: 'modal.trigger', Portal: '', Overlay: 'modal.backdrop', Content: 'modal.content', Title: 'modal.title', Description: 'modal.description', Close: 'modal.close' };

export const CATALOG: readonly CatalogEntry[] = [
	{ match: /^(react|react-dom|vue|svelte|preact|solid-js)(\/.*)?$/, framework: 'none', class: 'framework', reason: 'the old framework itself; Markless replaces it', replacement: '@markless/core' },
	{ match: /^(@tanstack\/(react|vue|solid|svelte)-router|react-router(-dom)?|vue-router|@remix-run\/react|next(\/.*)?|nuxt|@sveltejs\/kit)$/, framework: 'react', class: 'framework', reason: 'routing and links; the Markless router owns file routes, links and page data', replacement: '@markless/router' },
	{ match: /^@tanstack\/(react|vue)-router-devtools$|^@tanstack\/(react|vue)-query-devtools$/, framework: 'react', class: 'drop', reason: 'development-only devtools, never rendered in a production build' },
	radix('dialog', dialogParts, 'modal'),
	radix('alert-dialog', { ...dialogParts, Root: 'modal.root', Action: 'modal.close', Cancel: 'modal.close' }, 'modal (with alert)'),
	radix('dropdown-menu', { Root: 'menu.root', Trigger: 'menu.trigger', Portal: '', Content: 'menu.content', Item: 'menu.item', CheckboxItem: 'menu.item', RadioItem: 'menu.item', RadioGroup: 'menu.root', ItemIndicator: '', Label: '', Separator: 'base.separator', Group: '', Sub: 'menu.item', SubTrigger: 'menu.item', SubContent: 'menu.itemcontent' }, 'menu'),
	radix('popover', { Root: 'popover.root', Trigger: 'popover.trigger', Anchor: 'popover.trigger', Portal: '', Content: 'popover.content', Close: 'popover.close' }, 'popover'),
	radix('select', { Root: 'select.root', Trigger: 'select.trigger', Value: 'select.trigger', Icon: '', Portal: '', Content: 'select.content', Viewport: '', Item: 'select.item', ItemText: 'select.itemlabel', ItemIndicator: 'select.itemindicator', Group: '', Label: 'select.label', Separator: 'base.separator', ScrollUpButton: '', ScrollDownButton: '' }, 'select'),
	radix('tabs', { Root: 'tabs.root', List: 'tabs.list', Trigger: 'tabs.trigger', Content: 'tabs.content' }, 'tabs'),
	radix('checkbox', { Root: 'checkbox.trigger', Indicator: 'checkbox.indicator' }, 'checkbox'),
	radix('collapsible', { Root: 'collapsible.root', Trigger: 'collapsible.trigger', Content: 'collapsible.content', CollapsibleTrigger: 'collapsible.trigger', CollapsibleContent: 'collapsible.content' }, 'collapsible'),
	radix('radio-group', { Root: 'radiogroup.root', Item: 'radiogroup.itemtrigger', Indicator: 'radiogroup.itemindicator' }, 'radiogroup'),
	radix('switch', { Root: 'toggle.trigger', Thumb: 'toggle.thumb' }, 'toggle'),
	radix('tooltip', { Provider: '', Root: 'tooltip.root', Trigger: 'tooltip.trigger', Portal: '', Content: 'tooltip.content', Arrow: '' }, 'tooltip'),
	radix('accordion', { Root: 'accordion.root', Item: 'accordion.item', Header: 'accordion.itemlabel', Trigger: 'accordion.itemtrigger', Content: 'accordion.itemcontent' }, 'accordion'),
	radix('slider', { Root: 'slider.root', Track: 'slider.track', Range: 'slider.track', Thumb: 'slider.thumb' }, 'slider'),
	radix('progress', { Root: 'progress.root', Indicator: 'progress.indicator' }, 'progress'),
	radix('hover-card', { Root: 'hovercard.root', Trigger: 'hovercard.trigger', Portal: '', Content: 'hovercard.content' }, 'hovercard'),
	radix('toggle-group', { Root: 'buttongroup.root', Item: 'buttongroup.item' }, 'buttongroup'),
	radix('toolbar', { Root: 'toolbar.root', Button: 'toolbar.item', Link: 'toolbar.item', Separator: 'base.separator' }, 'toolbar'),
	radix('menubar', { Root: 'menubar.root', Menu: 'menubar.item', Trigger: 'menubar.item', Content: 'menubar.itemcontent', Item: 'menu.item' }, 'menubar'),
	radix('navigation-menu', { Root: 'navbar.root', List: '', Item: 'navbar.item', Trigger: 'navbar.itemtrigger', Content: 'navbar.itemcontent', Link: 'navbar.itemlink', Viewport: '', Indicator: '' }, 'navbar'),
	radix('context-menu', { Root: 'menu.root', Trigger: 'menu.contextarea', Content: 'menu.content', Item: 'menu.item' }, 'menu'),
	radix('separator', { Root: 'base.separator' }, 'base.separator'),
	radix('label', { Root: 'base.label' }, 'base.label'),
	{ match: /^@radix-ui\/react-avatar$/, framework: 'react', class: 'parity', reason: 'an image with a fallback while it loads or when it fails; no @markless/ui family, a few lines of state', parts: { Root: '', Image: '', Fallback: '' }, tokens: ['data-state'] },
	{ match: /^@radix-ui\/react-scroll-area$/, framework: 'react', class: 'drop', reason: 'custom scrollbars over native overflow; native `overflow: auto` with scrollbar CSS does the job', replacement: 'CSS overflow', tokens: ['--radix-scroll-area-', 'data-state', 'data-orientation'] },
	{ match: /^@radix-ui\/react-slot$/, framework: 'react', class: 'drop', reason: '`asChild` merges props onto a React child; in Markless render the target element itself with the classes and props', replacement: 'the element itself' },
	{ match: /^@radix-ui\/react-direction$/, framework: 'react', class: 'drop', reason: 'React context for reading direction; Markless reads `dir` from the document', replacement: 'the dir attribute' },
	{ match: /^@radix-ui\/react-icons$|^lucide-react$|^react-icons(\/.*)?$|^@heroicons\/react(\/.*)?$|^@tabler\/icons-react$/, framework: 'react', class: 'parity', reason: 'icons as React components; port each used icon as inline SVG markup (or @markless/icons from @markless/ui 0.5)', replacement: 'inline SVG' },
	{ match: /^sonner$/, framework: 'react', class: 'markless-ui', reason: 'toasts; @markless/ui toaster owns the live region, timing and dismissal', replacement: '@markless/ui toaster', parts: { Toaster: 'toaster.root', toast: 'toaster.item', 'toast.promise': 'toaster.item', 'toast.success': 'toaster.item', 'toast.error': 'toaster.item' }, tokens: ['data-sonner-', '--normal-', '--width', '--offset'] },
	{ match: /^cmdk$/, framework: 'react', class: 'markless-ui', reason: 'a filtered command list; @markless/ui combobox is a text field with a list attached', replacement: '@markless/ui combobox', parts: { Command: 'combobox.root', 'Command.Input': 'combobox.input', 'Command.List': 'combobox.content', 'Command.Item': 'combobox.item', 'Command.Empty': '', 'Command.Group': '', 'Command.Separator': 'base.separator', 'Command.Dialog': 'modal.root' }, tokens: ['cmdk-'] },
	{ match: /^input-otp$/, framework: 'react', class: 'markless-ui', reason: 'a one-time code over one input; @markless/ui otp', replacement: '@markless/ui otp', parts: { OTPInput: 'otp.root', OTPInputContext: 'otp.item' } },
	{ match: /^react-day-picker$/, framework: 'react', class: 'markless-ui', reason: 'a month grid to pick a date; @markless/ui calendar', replacement: '@markless/ui calendar', parts: { DayPicker: 'calendar.root' }, tokens: ['rdp-'] },
	{ match: /^vaul$/, framework: 'react', class: 'markless-ui', reason: 'a drawer dialog; @markless/ui drawer', replacement: '@markless/ui drawer', parts: { 'Drawer.Root': 'drawer.root', 'Drawer.Trigger': 'drawer.trigger', 'Drawer.Content': 'drawer.content', 'Drawer.Overlay': 'drawer.backdrop', 'Drawer.Title': 'drawer.title', 'Drawer.Description': 'drawer.description', 'Drawer.Close': 'drawer.close' } },
	{ match: /^react-select$/, framework: 'react', class: 'markless-ui', reason: 'a select with search; @markless/ui combobox (searchable) or select', replacement: '@markless/ui combobox', parts: { default: 'combobox.root' } },
	{ match: /^@tanstack\/(react|vue|solid|svelte)-table$/, framework: 'react', class: 'parity', reason: 'TanStack Table is a framework-agnostic engine with a thin hook per framework: keep the engine, port only the adapter the app calls', core: '@tanstack/table-core', replacement: '@tanstack/table-core under a Markless adapter (@markless/ui table for the widget layer in 0.5)' },
	{ match: /^@tanstack\/(react|vue|solid|svelte)-query$/, framework: 'react', class: 'parity', reason: 'TanStack Query keeps its cache in a framework-agnostic core; port the hooks the app calls, or replace a query with an async computed()', core: '@tanstack/query-core' },
	{ match: /^react-hook-form$/, framework: 'react', class: 'parity', reason: 'form state as React hooks and context; port the used hooks over Markless state()', replacement: 'state() and computed() form state' },
	{ match: /^@hookform\/resolvers(\/.*)?$/, framework: 'none', class: 'parity', reason: 'adapts a schema library to react-hook-form; ported with it (a few lines over the schema library)' },
	{ match: /^recharts$/, framework: 'react', class: 'parity', reason: 'charts as React components; no @markless/ui family draws charts, port the used charts as SVG (d3-scale and d3-shape are framework-agnostic and usable as-is)', core: 'd3-shape', tokens: ['recharts-'] },
	{ match: /^(framer-motion|motion\/react)$/, framework: 'react', class: 'parity', reason: 'animation as React components; port to CSS transitions or the framework-agnostic `motion` animate()', core: 'motion' },
	{ match: /^zustand(\/.*)?$/, framework: 'react', class: 'parity', reason: 'a store with a React hook; the store is framework-agnostic (zustand/vanilla), the hook becomes shared() state', core: 'zustand/vanilla' },
	{ match: /^react-top-loading-bar$/, framework: 'react', class: 'parity', reason: 'a navigation progress bar component; a few lines over the router\'s navigation events' },
	{ match: /^@clerk\/(react|nextjs|clerk-react)$/, framework: 'react', class: 'parity', reason: 'auth UI and hooks for React; port the used components over @clerk/clerk-js', core: '@clerk/clerk-js' },
	{ match: /^(ag-grid-(community|enterprise)|@ag-grid-(community|enterprise)\/.+|handsontable|tabulator-tables|gridjs|datatables\.net(-.+)?|chart\.js|echarts|highcharts|apexcharts|plotly\.js(-dist(-min)?)?|uplot|lightweight-charts|monaco-editor|codemirror|@codemirror\/view|quill|@tiptap\/core|prosemirror-view|leaflet|mapbox-gl|maplibre-gl|ol|swiper|flatpickr|tom-select|choices\.js|@fullcalendar\/core|video\.js|xterm|@xterm\/xterm|three)$/, framework: 'none', class: 'dom', reason: 'a framework-agnostic library that draws its own UI into the page: plan decides whether to port the parts the app uses or to use it directly from Markless code, loaded when needed' },
	{ match: /^(ag-grid-(react|vue3?|angular)|@handsontable\/(react|vue3?)|react-chartjs-2|vue-chartjs|echarts-for-react|vue-echarts|highcharts-react-official|highcharts-vue|react-apexcharts|vue3-apexcharts|react-plotly\.js|@monaco-editor\/react|@guolao\/vue-monaco-editor|@uiw\/react-codemirror|react-quill(-new)?|@vueup\/vue-quill|@tiptap\/(react|vue-3)|react-leaflet|@vue-leaflet\/vue-leaflet|react-map-gl|@fullcalendar\/(react|vue3?)|swiper\/(react|vue))$/, framework: 'react', class: 'dom', reason: 'a framework wrapper over a library that draws its own UI: the wrapper is always replaced by a Markless port of the parts the app uses; plan decides whether that port uses the library underneath directly or replaces it too' },
	{ match: /^(zod|valibot|yup|date-fns|dayjs|clsx|classnames|tailwind-merge|class-variance-authority|axios|ky|lodash(-es)?|nanoid|uuid|@faker-js\/faker|immer|superjson|d3-.*|marked|dompurify)(\/.*)?$/, framework: 'none', class: 'as-is', reason: 'framework-agnostic: import it unchanged from the Markless app' },
	{ match: /^@fontsource(-variable)?\//, framework: 'none', class: 'as-is', reason: 'self-hosted font files with their @font-face CSS: import the same stylesheets from the Markless app', css: true },
	{ match: /^tailwindcss$|^@tailwindcss\/vite$|^tw-animate-css$/, framework: 'none', class: 'as-is', reason: 'CSS tooling: keep it in the Markless app\'s Vite config and stylesheet' },
	{ match: /^@vueuse\/core$/, framework: 'vue', class: 'parity', reason: 'Vue composables; port each used composable over state(), computed() and attach (many are a few lines of DOM listening)' },
	{ match: /^pinia$/, framework: 'vue', class: 'parity', reason: 'stores bound to Vue reactivity; each store becomes shared() state with plain functions for its actions', replacement: 'shared()' },
	{ match: /^@headlessui\/(vue|react)$/, framework: 'vue', class: 'markless-ui', reason: 'headless widgets; each maps to a @markless/ui family', parts: { Menu: 'menu.root', MenuButton: 'menu.trigger', MenuItems: 'menu.content', MenuItem: 'menu.item', Dialog: 'modal.root', DialogPanel: 'modal.content', DialogTitle: 'modal.title', DialogDescription: 'modal.description', TransitionRoot: '', TransitionChild: '', Listbox: 'select.root', ListboxButton: 'select.trigger', ListboxOptions: 'select.content', ListboxOption: 'select.item', Combobox: 'combobox.root', ComboboxInput: 'combobox.input', ComboboxOptions: 'combobox.content', ComboboxOption: 'combobox.item', Switch: 'toggle.trigger', SwitchGroup: 'toggle.root', SwitchLabel: 'toggle.label', TabGroup: 'tabs.root', TabList: 'tabs.list', Tab: 'tabs.trigger', TabPanels: '', TabPanel: 'tabs.content', Disclosure: 'collapsible.root', DisclosureButton: 'collapsible.trigger', DisclosurePanel: 'collapsible.content', Popover: 'popover.root', PopoverButton: 'popover.trigger', PopoverPanel: 'popover.content', RadioGroup: 'radiogroup.root', RadioGroupOption: 'radiogroup.item' } },
	{ match: /^vuetify(\/.*)?$/, framework: 'vue', class: 'markless-ui', reason: 'a Vue component kit; its widgets map to @markless/ui families and its look to your own CSS', parts: { VBtn: 'base.button', VDialog: 'modal.root', VMenu: 'menu.root', VList: '', VListItem: 'menu.item', VTabs: 'tabs.list', VTab: 'tabs.trigger', VWindow: '', VWindowItem: 'tabs.content', VSelect: 'select.root', VAutocomplete: 'combobox.root', VCombobox: 'combobox.root', VCheckbox: 'checkbox.root', VSwitch: 'toggle.root', VRadioGroup: 'radiogroup.root', VRadio: 'radiogroup.item', VTextField: 'textbox.root', VTextarea: 'textbox.textarea', VTooltip: 'tooltip.root', VDataTable: 'table.root', VPagination: 'pagination.root', VSnackbar: 'toaster.item', VExpansionPanels: 'accordion.root', VExpansionPanel: 'accordion.item', VSlider: 'slider.root', VProgressLinear: 'progress.root', VNavigationDrawer: 'drawer.root', VCard: '', VContainer: '', VRow: '', VCol: '' }, tokens: ['v-'] },
	{ match: /^bits-ui$/, framework: 'svelte', class: 'markless-ui', reason: 'Svelte headless widgets; each namespace maps to a @markless/ui family', parts: { 'Dialog.Root': 'modal.root', 'Dialog.Trigger': 'modal.trigger', 'Dialog.Overlay': 'modal.backdrop', 'Dialog.Content': 'modal.content', 'Dialog.Title': 'modal.title', 'Dialog.Description': 'modal.description', 'Dialog.Close': 'modal.close', 'Dialog.Portal': '', 'DropdownMenu.Root': 'menu.root', 'DropdownMenu.Trigger': 'menu.trigger', 'DropdownMenu.Content': 'menu.content', 'DropdownMenu.Item': 'menu.item', 'Tabs.Root': 'tabs.root', 'Tabs.List': 'tabs.list', 'Tabs.Trigger': 'tabs.trigger', 'Tabs.Content': 'tabs.content', 'Select.Root': 'select.root', 'Select.Trigger': 'select.trigger', 'Select.Content': 'select.content', 'Select.Item': 'select.item', 'Checkbox.Root': 'checkbox.trigger', 'Switch.Root': 'toggle.trigger', 'Switch.Thumb': 'toggle.thumb', 'Tooltip.Root': 'tooltip.root', 'Tooltip.Trigger': 'tooltip.trigger', 'Tooltip.Content': 'tooltip.content', 'Popover.Root': 'popover.root', 'Popover.Trigger': 'popover.trigger', 'Popover.Content': 'popover.content', 'Accordion.Root': 'accordion.root', 'Accordion.Item': 'accordion.item', 'Accordion.Trigger': 'accordion.itemtrigger', 'Accordion.Content': 'accordion.itemcontent', 'Collapsible.Root': 'collapsible.root', 'Collapsible.Trigger': 'collapsible.trigger', 'Collapsible.Content': 'collapsible.content', 'Combobox.Root': 'combobox.root', 'Combobox.Input': 'combobox.input', 'RadioGroup.Root': 'radiogroup.root', 'RadioGroup.Item': 'radiogroup.itemtrigger', 'Pagination.Root': 'pagination.root', 'Slider.Root': 'slider.root', 'Progress.Root': 'progress.root' }, tokens: ['data-state', 'data-disabled', 'data-orientation'] },
	{ match: /^sveltekit-superforms(\/.*)?$/, framework: 'svelte', class: 'parity', reason: 'form state as Svelte stores; port the used surface over state() and computed()' },
	{ match: /^svelte-sonner$|^vue-sonner$/, framework: 'svelte', class: 'markless-ui', reason: 'toasts; @markless/ui toaster', replacement: '@markless/ui toaster', parts: { Toaster: 'toaster.root', toast: 'toaster.item' } },
];

/** The framework-agnostic library a framework wrapper drives. */
const WRAPPED: readonly [RegExp, string][] = [
	[/^ag-grid-(react|vue3?|angular)$/, 'ag-grid-community'],
	[/^@handsontable\//, 'handsontable'],
	[/^(react|vue)-chartjs(-2)?$/, 'chart.js'],
	[/^(echarts-for-react|vue-echarts)$/, 'echarts'],
	[/^highcharts-(react-official|vue)$/, 'highcharts'],
	[/^(react|vue3)-apexcharts$/, 'apexcharts'],
	[/^react-plotly\.js$/, 'plotly.js'],
	[/^(@monaco-editor\/react|@guolao\/vue-monaco-editor)$/, 'monaco-editor'],
	[/^@uiw\/react-codemirror$/, '@codemirror/view'],
	[/^(react-quill(-new)?|@vueup\/vue-quill)$/, 'quill'],
	[/^@tiptap\/(react|vue-3)$/, '@tiptap/core'],
	[/^(react-leaflet|@vue-leaflet\/vue-leaflet)$/, 'leaflet'],
	[/^react-map-gl$/, 'maplibre-gl'],
	[/^@fullcalendar\/(react|vue3?)$/, '@fullcalendar/core'],
];

export function wrappedEngine(name: string): string | undefined {
	return WRAPPED.find(([re]) => re.test(name))?.[1];
}

/** What check cannot verify about a catalogued engine: it draws pixels, or its behaviour is gestures the journeys never make. */
const TRAITS: readonly [RegExp, { draws?: 'canvas' | 'webgl'; needs?: 'text editing' | 'dragging, panning or zooming' }][] = [
	[/^(chart\.js|echarts|uplot|lightweight-charts)$/, { draws: 'canvas' }],
	[/^(mapbox-gl|maplibre-gl|three)$/, { draws: 'webgl', needs: 'dragging, panning or zooming' }],
	[/^(monaco-editor|codemirror|@codemirror\/view|quill|@tiptap\/core|prosemirror-view|xterm|@xterm\/xterm)$/, { needs: 'text editing' }],
	[/^(leaflet|ol|swiper)$/, { needs: 'dragging, panning or zooming' }],
];

export function engineTraits(name: string): { draws?: 'canvas' | 'webgl'; needs?: 'text editing' | 'dragging, panning or zooming' } {
	return TRAITS.find(([re]) => re.test(name))?.[1] ?? {};
}

export function catalogEntry(name: string): CatalogEntry | undefined {
	return CATALOG.find((c) => c.match.test(name));
}

/** ARIA role a part's element has, so a usage site can be found in recorded journeys. */
export const PART_ROLE: Readonly<Record<string, string>> = {
	'modal.trigger': 'button',
	'modal.close': 'button',
	'modal.content': 'dialog',
	'menu.trigger': 'button',
	'menu.item': 'menuitem',
	'popover.trigger': 'button',
	'select.trigger': 'combobox',
	'select.item': 'option',
	'tabs.trigger': 'tab',
	'tabs.content': 'tabpanel',
	'checkbox.trigger': 'checkbox',
	'checkbox.root': 'checkbox',
	'collapsible.trigger': 'button',
	'radiogroup.itemtrigger': 'radio',
	'toggle.trigger': 'switch',
	'tooltip.trigger': 'button',
	'accordion.itemtrigger': 'button',
	'combobox.input': 'combobox',
	'combobox.item': 'option',
	'base.button': 'button',
	'textbox.input': 'textbox',
	'pagination.itemtrigger': 'button',
};

/** What the conformance suite must see a part do, by part; the behaviour spec lists these per usage site. */
export const PART_BEHAVIOUR: Readonly<Record<string, readonly string[]>> = {
	'modal.root': ['closed until its trigger is pressed', 'open: focus moves into the dialog and the page behind is inert', 'Escape closes it and focus returns to the trigger'],
	'menu.root': ['closed until its trigger is pressed', 'Enter, Space or ArrowDown on the trigger opens it with the first item focused', 'ArrowDown and ArrowUp move between items', 'Escape closes it and focus returns to the trigger', 'choosing an item runs its action and closes the menu'],
	'popover.root': ['closed until its trigger is pressed', 'open: content next to the trigger', 'Escape closes it and focus returns to the trigger'],
	'select.root': ['trigger shows the current value', 'opening lists every option', 'choosing an option updates the trigger and closes the list'],
	'tabs.root': ['the default tab is selected and its panel shows', 'clicking a tab shows its panel and hides the others', 'ArrowLeft and ArrowRight move between tabs, skipping disabled ones'],
	'checkbox.trigger': ['unchecked, checked and (when written) indeterminate states', 'Space and click toggle it'],
	'collapsible.root': ['closed or open as written', 'the trigger toggles the content and aria-expanded'],
	'toggle.trigger': ['on and off states', 'Space and click toggle it'],
	'tooltip.root': ['hidden until its trigger is hovered or focused', 'Escape hides it'],
	'toaster.root': ['each message appears in a live region and is announced', 'a message leaves after its duration'],
	'combobox.root': ['typing filters the list', 'ArrowDown and Enter choose an option'],
	'radiogroup.root': ['one choice checked', 'arrow keys move the choice'],
	'accordion.root': ['each heading toggles its panel'],
	'base.separator': ['a separator with the same orientation'],
};
