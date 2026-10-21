import type { LibraryPort } from '../types.ts';
import { RADIX_ALERT_DIALOG, RADIX_DIALOG } from './radix-ui-react-dialog/support.ts';

/** Every certified port markless-migrate ships, by the library it replaces. */
export const PORTS: Readonly<Record<string, LibraryPort>> = { [RADIX_DIALOG.library]: RADIX_DIALOG, [RADIX_ALERT_DIALOG.library]: RADIX_ALERT_DIALOG };

/** Where the shipped ports' files are. */
export const PORTS_DIR = new URL('.', import.meta.url).pathname;

/** Where a port goes in the new app, relative to it. */
export const portDir = (port: LibraryPort) => `lib/ports/${port.dir}`;
