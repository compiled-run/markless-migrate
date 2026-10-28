// What /create's designer and its preview iframe post each other: the params (use-iframe-sync), and the keys the
// preview forwards (action-menu, random-button, use-reset, use-open-preset, history-buttons, mode-switcher).
export const DESIGN_SYSTEM_MESSAGE = 'design-system-params';
/** The port's own: the preview listens from its idle work on, later than the iframe's load, and asks for the params then. */
export const DESIGN_SYSTEM_READY = 'design-system-ready';
export const CMD_K_FORWARD_TYPE = 'cmd-k-forward';
export const RANDOMIZE_FORWARD_TYPE = 'randomize-forward';
export const RESET_FORWARD_TYPE = 'reset-forward';
export const OPEN_PRESET_FORWARD_TYPE = 'open-preset-forward';
export const UNDO_FORWARD_TYPE = 'undo-forward';
export const REDO_FORWARD_TYPE = 'redo-forward';
export const DARK_MODE_FORWARD_TYPE = 'dark-mode-forward';

/** /preview/{base}/{name}: the page /create shows in its iframe. */
export const isCreatePreview = (pathname: string): boolean => /^\/preview\/(base|radix|aria)\/[^/]+\/?$/.test(pathname);
