import { use } from '../../parts/index.ts';
import * as cmdk from '../../parts/cmdk.ts';
import * as dialog from '../../parts/base-ui/dialog.ts';
import * as menu from '../../parts/base-ui/menu.ts';
import { SITE_PARTS } from '../../examples/shadcn-ui-markless/lib/site/parts.ts';

// What convert writes for /create: the site's parts, then the ports the designer's controls use.
export const { behave, listen } = use(SITE_PARTS, { cmdk, 'base-ui/dialog': dialog, 'base-ui/menu': menu });
