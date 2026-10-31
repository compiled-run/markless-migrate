// getAllItems() for /create's palette (ActionMenu): each base's registry items other than the numbered previews, blocks
// first (sortRegistryGroups), with the value cmdk scores (the label and the type's keywords). Read off the old page's props.
export interface PaletteEntry {
	readonly name: string;
	readonly label: string;
	readonly value: string;
}

export const PALETTE_ITEMS: Readonly<Record<string, readonly PaletteEntry[]>> = {
	"base": [
		{
			"name": "preview",
			"label": "Preview",
			"value": "Preview block blocks component components"
		},
		{
			"name": "accordion-example",
			"label": "Accordion",
			"value": "Accordion registry example"
		},
		{
			"name": "alert-example",
			"label": "Alert",
			"value": "Alert registry example"
		},
		{
			"name": "alert-dialog-example",
			"label": "Alert Dialog",
			"value": "Alert Dialog registry example"
		},
		{
			"name": "aspect-ratio-example",
			"label": "Aspect Ratio",
			"value": "Aspect Ratio registry example"
		},
		{
			"name": "avatar-example",
			"label": "Avatar",
			"value": "Avatar registry example"
		},
		{
			"name": "badge-example",
			"label": "Badge",
			"value": "Badge registry example"
		},
		{
			"name": "breadcrumb-example",
			"label": "Breadcrumb",
			"value": "Breadcrumb registry example"
		},
		{
			"name": "button-example",
			"label": "Button",
			"value": "Button registry example"
		},
		{
			"name": "button-group-example",
			"label": "Button Group",
			"value": "Button Group registry example"
		},
		{
			"name": "calendar-example",
			"label": "Calendar",
			"value": "Calendar registry example"
		},
		{
			"name": "card-example",
			"label": "Card",
			"value": "Card registry example"
		},
		{
			"name": "carousel-example",
			"label": "Carousel",
			"value": "Carousel registry example"
		},
		{
			"name": "chart-example",
			"label": "Chart",
			"value": "Chart registry example"
		},
		{
			"name": "checkbox-example",
			"label": "Checkbox",
			"value": "Checkbox registry example"
		},
		{
			"name": "collapsible-example",
			"label": "Collapsible",
			"value": "Collapsible registry example"
		},
		{
			"name": "combobox-example",
			"label": "Combobox",
			"value": "Combobox registry example"
		},
		{
			"name": "command-example",
			"label": "Command",
			"value": "Command registry example"
		},
		{
			"name": "context-menu-example",
			"label": "Context Menu",
			"value": "Context Menu registry example"
		},
		{
			"name": "dialog-example",
			"label": "Dialog",
			"value": "Dialog registry example"
		},
		{
			"name": "drawer-example",
			"label": "Drawer",
			"value": "Drawer registry example"
		},
		{
			"name": "dropdown-menu-example",
			"label": "Dropdown Menu",
			"value": "Dropdown Menu registry example"
		},
		{
			"name": "empty-example",
			"label": "Empty",
			"value": "Empty registry example"
		},
		{
			"name": "field-example",
			"label": "Field",
			"value": "Field registry example"
		},
		{
			"name": "hover-card-example",
			"label": "Hover Card",
			"value": "Hover Card registry example"
		},
		{
			"name": "input-example",
			"label": "Input",
			"value": "Input registry example"
		},
		{
			"name": "input-group-example",
			"label": "Input Group",
			"value": "Input Group registry example"
		},
		{
			"name": "input-otp-example",
			"label": "Input OTP",
			"value": "Input OTP registry example"
		},
		{
			"name": "item-example",
			"label": "Item",
			"value": "Item registry example"
		},
		{
			"name": "kbd-example",
			"label": "Kbd",
			"value": "Kbd registry example"
		},
		{
			"name": "label-example",
			"label": "Label",
			"value": "Label registry example"
		},
		{
			"name": "menubar-example",
			"label": "Menubar",
			"value": "Menubar registry example"
		},
		{
			"name": "native-select-example",
			"label": "Native Select",
			"value": "Native Select registry example"
		},
		{
			"name": "navigation-menu-example",
			"label": "Navigation Menu",
			"value": "Navigation Menu registry example"
		},
		{
			"name": "pagination-example",
			"label": "Pagination",
			"value": "Pagination registry example"
		},
		{
			"name": "popover-example",
			"label": "Popover",
			"value": "Popover registry example"
		},
		{
			"name": "progress-example",
			"label": "Progress",
			"value": "Progress registry example"
		},
		{
			"name": "radio-group-example",
			"label": "Radio Group",
			"value": "Radio Group registry example"
		},
		{
			"name": "resizable-example",
			"label": "Resizable",
			"value": "Resizable registry example"
		},
		{
			"name": "scroll-area-example",
			"label": "Scroll Area",
			"value": "Scroll Area registry example"
		},
		{
			"name": "select-example",
			"label": "Select",
			"value": "Select registry example"
		},
		{
			"name": "separator-example",
			"label": "Separator",
			"value": "Separator registry example"
		},
		{
			"name": "sheet-example",
			"label": "Sheet",
			"value": "Sheet registry example"
		},
		{
			"name": "sidebar-example",
			"label": "Sidebar",
			"value": "Sidebar registry example"
		},
		{
			"name": "sidebar-icon-example",
			"label": "Sidebar (Icon)",
			"value": "Sidebar (Icon) registry example"
		},
		{
			"name": "sidebar-inset-example",
			"label": "Sidebar (Inset)",
			"value": "Sidebar (Inset) registry example"
		},
		{
			"name": "sidebar-floating-example",
			"label": "Sidebar (Floating)",
			"value": "Sidebar (Floating) registry example"
		},
		{
			"name": "skeleton-example",
			"label": "Skeleton",
			"value": "Skeleton registry example"
		},
		{
			"name": "slider-example",
			"label": "Slider",
			"value": "Slider registry example"
		},
		{
			"name": "sonner-example",
			"label": "Sonner",
			"value": "Sonner registry example"
		},
		{
			"name": "spinner-example",
			"label": "Spinner",
			"value": "Spinner registry example"
		},
		{
			"name": "switch-example",
			"label": "Switch",
			"value": "Switch registry example"
		},
		{
			"name": "table-example",
			"label": "Table",
			"value": "Table registry example"
		},
		{
			"name": "tabs-example",
			"label": "Tabs",
			"value": "Tabs registry example"
		},
		{
			"name": "textarea-example",
			"label": "Textarea",
			"value": "Textarea registry example"
		},
		{
			"name": "toast-example",
			"label": "Toast",
			"value": "Toast registry example"
		},
		{
			"name": "toggle-example",
			"label": "Toggle",
			"value": "Toggle registry example"
		},
		{
			"name": "toggle-group-example",
			"label": "Toggle Group",
			"value": "Toggle Group registry example"
		},
		{
			"name": "tooltip-example",
			"label": "Tooltip",
			"value": "Tooltip registry example"
		},
		{
			"name": "demo",
			"label": "Demo",
			"value": "Demo registry example"
		},
		{
			"name": "attachment-example",
			"label": "Attachment",
			"value": "Attachment registry example"
		},
		{
			"name": "bubble-example",
			"label": "Bubble",
			"value": "Bubble registry example"
		},
		{
			"name": "message-scroller-example",
			"label": "Message Scroller",
			"value": "Message Scroller registry example"
		},
		{
			"name": "questionnaire-example",
			"label": "Questionnaire",
			"value": "Questionnaire registry example"
		},
		{
			"name": "marker-example",
			"label": "Marker",
			"value": "Marker registry example"
		},
		{
			"name": "trace-example",
			"label": "Trace",
			"value": "Trace registry example"
		},
		{
			"name": "code-block-example",
			"label": "Code Block",
			"value": "Code Block registry example"
		},
		{
			"name": "message-example",
			"label": "Message",
			"value": "Message registry example"
		}
	],
	"aria": [
		{
			"name": "preview",
			"label": "Preview",
			"value": "Preview block blocks component components"
		},
		{
			"name": "accordion-example",
			"label": "Accordion",
			"value": "Accordion registry example"
		},
		{
			"name": "alert-example",
			"label": "Alert",
			"value": "Alert registry example"
		},
		{
			"name": "alert-dialog-example",
			"label": "Alert Dialog",
			"value": "Alert Dialog registry example"
		},
		{
			"name": "aspect-ratio-example",
			"label": "Aspect Ratio",
			"value": "Aspect Ratio registry example"
		},
		{
			"name": "avatar-example",
			"label": "Avatar",
			"value": "Avatar registry example"
		},
		{
			"name": "badge-example",
			"label": "Badge",
			"value": "Badge registry example"
		},
		{
			"name": "breadcrumb-example",
			"label": "Breadcrumb",
			"value": "Breadcrumb registry example"
		},
		{
			"name": "button-example",
			"label": "Button",
			"value": "Button registry example"
		},
		{
			"name": "button-group-example",
			"label": "Button Group",
			"value": "Button Group registry example"
		},
		{
			"name": "calendar-example",
			"label": "Calendar",
			"value": "Calendar registry example"
		},
		{
			"name": "card-example",
			"label": "Card",
			"value": "Card registry example"
		},
		{
			"name": "carousel-example",
			"label": "Carousel",
			"value": "Carousel registry example"
		},
		{
			"name": "chart-example",
			"label": "Chart",
			"value": "Chart registry example"
		},
		{
			"name": "checkbox-example",
			"label": "Checkbox",
			"value": "Checkbox registry example"
		},
		{
			"name": "collapsible-example",
			"label": "Collapsible",
			"value": "Collapsible registry example"
		},
		{
			"name": "combobox-example",
			"label": "Combobox",
			"value": "Combobox registry example"
		},
		{
			"name": "command-example",
			"label": "Command",
			"value": "Command registry example"
		},
		{
			"name": "context-menu-example",
			"label": "Context Menu",
			"value": "Context Menu registry example"
		},
		{
			"name": "dialog-example",
			"label": "Dialog",
			"value": "Dialog registry example"
		},
		{
			"name": "drawer-example",
			"label": "Drawer",
			"value": "Drawer registry example"
		},
		{
			"name": "dropdown-menu-example",
			"label": "Dropdown Menu",
			"value": "Dropdown Menu registry example"
		},
		{
			"name": "empty-example",
			"label": "Empty",
			"value": "Empty registry example"
		},
		{
			"name": "field-example",
			"label": "Field",
			"value": "Field registry example"
		},
		{
			"name": "hover-card-example",
			"label": "Hover Card",
			"value": "Hover Card registry example"
		},
		{
			"name": "input-example",
			"label": "Input",
			"value": "Input registry example"
		},
		{
			"name": "input-group-example",
			"label": "Input Group",
			"value": "Input Group registry example"
		},
		{
			"name": "input-otp-example",
			"label": "Input OTP",
			"value": "Input OTP registry example"
		},
		{
			"name": "item-example",
			"label": "Item",
			"value": "Item registry example"
		},
		{
			"name": "kbd-example",
			"label": "Kbd",
			"value": "Kbd registry example"
		},
		{
			"name": "label-example",
			"label": "Label",
			"value": "Label registry example"
		},
		{
			"name": "native-select-example",
			"label": "Native Select",
			"value": "Native Select registry example"
		},
		{
			"name": "pagination-example",
			"label": "Pagination",
			"value": "Pagination registry example"
		},
		{
			"name": "popover-example",
			"label": "Popover",
			"value": "Popover registry example"
		},
		{
			"name": "progress-example",
			"label": "Progress",
			"value": "Progress registry example"
		},
		{
			"name": "radio-group-example",
			"label": "Radio Group",
			"value": "Radio Group registry example"
		},
		{
			"name": "resizable-example",
			"label": "Resizable",
			"value": "Resizable registry example"
		},
		{
			"name": "scroll-area-example",
			"label": "Scroll Area",
			"value": "Scroll Area registry example"
		},
		{
			"name": "select-example",
			"label": "Select",
			"value": "Select registry example"
		},
		{
			"name": "separator-example",
			"label": "Separator",
			"value": "Separator registry example"
		},
		{
			"name": "sheet-example",
			"label": "Sheet",
			"value": "Sheet registry example"
		},
		{
			"name": "sidebar-example",
			"label": "Sidebar",
			"value": "Sidebar registry example"
		},
		{
			"name": "sidebar-icon-example",
			"label": "Sidebar (Icon)",
			"value": "Sidebar (Icon) registry example"
		},
		{
			"name": "sidebar-inset-example",
			"label": "Sidebar (Inset)",
			"value": "Sidebar (Inset) registry example"
		},
		{
			"name": "sidebar-floating-example",
			"label": "Sidebar (Floating)",
			"value": "Sidebar (Floating) registry example"
		},
		{
			"name": "skeleton-example",
			"label": "Skeleton",
			"value": "Skeleton registry example"
		},
		{
			"name": "slider-example",
			"label": "Slider",
			"value": "Slider registry example"
		},
		{
			"name": "sonner-example",
			"label": "Sonner",
			"value": "Sonner registry example"
		},
		{
			"name": "spinner-example",
			"label": "Spinner",
			"value": "Spinner registry example"
		},
		{
			"name": "switch-example",
			"label": "Switch",
			"value": "Switch registry example"
		},
		{
			"name": "table-example",
			"label": "Table",
			"value": "Table registry example"
		},
		{
			"name": "tabs-example",
			"label": "Tabs",
			"value": "Tabs registry example"
		},
		{
			"name": "textarea-example",
			"label": "Textarea",
			"value": "Textarea registry example"
		},
		{
			"name": "toggle-example",
			"label": "Toggle",
			"value": "Toggle registry example"
		},
		{
			"name": "toggle-group-example",
			"label": "Toggle Group",
			"value": "Toggle Group registry example"
		},
		{
			"name": "tooltip-example",
			"label": "Tooltip",
			"value": "Tooltip registry example"
		},
		{
			"name": "demo",
			"label": "Demo",
			"value": "Demo registry example"
		},
		{
			"name": "attachment-example",
			"label": "Attachment",
			"value": "Attachment registry example"
		},
		{
			"name": "bubble-example",
			"label": "Bubble",
			"value": "Bubble registry example"
		},
		{
			"name": "message-scroller-example",
			"label": "Message Scroller",
			"value": "Message Scroller registry example"
		},
		{
			"name": "questionnaire-example",
			"label": "Questionnaire",
			"value": "Questionnaire registry example"
		},
		{
			"name": "marker-example",
			"label": "Marker",
			"value": "Marker registry example"
		},
		{
			"name": "trace-example",
			"label": "Trace",
			"value": "Trace registry example"
		},
		{
			"name": "code-block-example",
			"label": "Code Block",
			"value": "Code Block registry example"
		},
		{
			"name": "message-example",
			"label": "Message",
			"value": "Message registry example"
		}
	],
	"radix": [
		{
			"name": "preview",
			"label": "Preview",
			"value": "Preview block blocks component components"
		},
		{
			"name": "accordion-example",
			"label": "Accordion",
			"value": "Accordion registry example"
		},
		{
			"name": "alert-example",
			"label": "Alert",
			"value": "Alert registry example"
		},
		{
			"name": "alert-dialog-example",
			"label": "Alert Dialog",
			"value": "Alert Dialog registry example"
		},
		{
			"name": "aspect-ratio-example",
			"label": "Aspect Ratio",
			"value": "Aspect Ratio registry example"
		},
		{
			"name": "avatar-example",
			"label": "Avatar",
			"value": "Avatar registry example"
		},
		{
			"name": "badge-example",
			"label": "Badge",
			"value": "Badge registry example"
		},
		{
			"name": "breadcrumb-example",
			"label": "Breadcrumb",
			"value": "Breadcrumb registry example"
		},
		{
			"name": "button-example",
			"label": "Button",
			"value": "Button registry example"
		},
		{
			"name": "button-group-example",
			"label": "Button Group",
			"value": "Button Group registry example"
		},
		{
			"name": "calendar-example",
			"label": "Calendar",
			"value": "Calendar registry example"
		},
		{
			"name": "card-example",
			"label": "Card",
			"value": "Card registry example"
		},
		{
			"name": "carousel-example",
			"label": "Carousel",
			"value": "Carousel registry example"
		},
		{
			"name": "chart-example",
			"label": "Chart",
			"value": "Chart registry example"
		},
		{
			"name": "checkbox-example",
			"label": "Checkbox",
			"value": "Checkbox registry example"
		},
		{
			"name": "collapsible-example",
			"label": "Collapsible",
			"value": "Collapsible registry example"
		},
		{
			"name": "combobox-example",
			"label": "Combobox",
			"value": "Combobox registry example"
		},
		{
			"name": "command-example",
			"label": "Command",
			"value": "Command registry example"
		},
		{
			"name": "context-menu-example",
			"label": "Context Menu",
			"value": "Context Menu registry example"
		},
		{
			"name": "dialog-example",
			"label": "Dialog",
			"value": "Dialog registry example"
		},
		{
			"name": "drawer-example",
			"label": "Drawer",
			"value": "Drawer registry example"
		},
		{
			"name": "dropdown-menu-example",
			"label": "Dropdown Menu",
			"value": "Dropdown Menu registry example"
		},
		{
			"name": "empty-example",
			"label": "Empty",
			"value": "Empty registry example"
		},
		{
			"name": "field-example",
			"label": "Field",
			"value": "Field registry example"
		},
		{
			"name": "hover-card-example",
			"label": "Hover Card",
			"value": "Hover Card registry example"
		},
		{
			"name": "input-example",
			"label": "Input",
			"value": "Input registry example"
		},
		{
			"name": "input-group-example",
			"label": "Input Group",
			"value": "Input Group registry example"
		},
		{
			"name": "input-otp-example",
			"label": "Input OTP",
			"value": "Input OTP registry example"
		},
		{
			"name": "item-example",
			"label": "Item",
			"value": "Item registry example"
		},
		{
			"name": "kbd-example",
			"label": "Kbd",
			"value": "Kbd registry example"
		},
		{
			"name": "label-example",
			"label": "Label",
			"value": "Label registry example"
		},
		{
			"name": "menubar-example",
			"label": "Menubar",
			"value": "Menubar registry example"
		},
		{
			"name": "native-select-example",
			"label": "Native Select",
			"value": "Native Select registry example"
		},
		{
			"name": "navigation-menu-example",
			"label": "Navigation Menu",
			"value": "Navigation Menu registry example"
		},
		{
			"name": "pagination-example",
			"label": "Pagination",
			"value": "Pagination registry example"
		},
		{
			"name": "popover-example",
			"label": "Popover",
			"value": "Popover registry example"
		},
		{
			"name": "progress-example",
			"label": "Progress",
			"value": "Progress registry example"
		},
		{
			"name": "radio-group-example",
			"label": "Radio Group",
			"value": "Radio Group registry example"
		},
		{
			"name": "resizable-example",
			"label": "Resizable",
			"value": "Resizable registry example"
		},
		{
			"name": "scroll-area-example",
			"label": "Scroll Area",
			"value": "Scroll Area registry example"
		},
		{
			"name": "select-example",
			"label": "Select",
			"value": "Select registry example"
		},
		{
			"name": "separator-example",
			"label": "Separator",
			"value": "Separator registry example"
		},
		{
			"name": "sheet-example",
			"label": "Sheet",
			"value": "Sheet registry example"
		},
		{
			"name": "sidebar-example",
			"label": "Sidebar",
			"value": "Sidebar registry example"
		},
		{
			"name": "sidebar-icon-example",
			"label": "Sidebar (Icon)",
			"value": "Sidebar (Icon) registry example"
		},
		{
			"name": "sidebar-inset-example",
			"label": "Sidebar (Inset)",
			"value": "Sidebar (Inset) registry example"
		},
		{
			"name": "sidebar-floating-example",
			"label": "Sidebar (Floating)",
			"value": "Sidebar (Floating) registry example"
		},
		{
			"name": "skeleton-example",
			"label": "Skeleton",
			"value": "Skeleton registry example"
		},
		{
			"name": "slider-example",
			"label": "Slider",
			"value": "Slider registry example"
		},
		{
			"name": "sonner-example",
			"label": "Sonner",
			"value": "Sonner registry example"
		},
		{
			"name": "spinner-example",
			"label": "Spinner",
			"value": "Spinner registry example"
		},
		{
			"name": "switch-example",
			"label": "Switch",
			"value": "Switch registry example"
		},
		{
			"name": "table-example",
			"label": "Table",
			"value": "Table registry example"
		},
		{
			"name": "tabs-example",
			"label": "Tabs",
			"value": "Tabs registry example"
		},
		{
			"name": "textarea-example",
			"label": "Textarea",
			"value": "Textarea registry example"
		},
		{
			"name": "toggle-example",
			"label": "Toggle",
			"value": "Toggle registry example"
		},
		{
			"name": "toggle-group-example",
			"label": "Toggle Group",
			"value": "Toggle Group registry example"
		},
		{
			"name": "tooltip-example",
			"label": "Tooltip",
			"value": "Tooltip registry example"
		},
		{
			"name": "demo",
			"label": "Demo",
			"value": "Demo registry example"
		},
		{
			"name": "attachment-example",
			"label": "Attachment",
			"value": "Attachment registry example"
		},
		{
			"name": "bubble-example",
			"label": "Bubble",
			"value": "Bubble registry example"
		},
		{
			"name": "message-scroller-example",
			"label": "Message Scroller",
			"value": "Message Scroller registry example"
		},
		{
			"name": "questionnaire-example",
			"label": "Questionnaire",
			"value": "Questionnaire registry example"
		},
		{
			"name": "marker-example",
			"label": "Marker",
			"value": "Marker registry example"
		},
		{
			"name": "trace-example",
			"label": "Trace",
			"value": "Trace registry example"
		},
		{
			"name": "code-block-example",
			"label": "Code Block",
			"value": "Code Block registry example"
		},
		{
			"name": "message-example",
			"label": "Message",
			"value": "Message registry example"
		}
	]
};
