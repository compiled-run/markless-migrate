import { use } from '../../parts/index.ts';
import * as dialog from '../../parts/base-ui/dialog.ts';
import * as menu from '../../parts/base-ui/menu.ts';
import * as select from '../../parts/base-ui/select.ts';
import * as tooltip from '../../parts/base-ui/tooltip.ts';
import { SITE_PARTS } from '../../examples/shadcn-ui-markless/lib/site/parts.ts';

// What convert writes for /typeset: the site's parts, then the ports the designer's controls use.
export const { behave, listen } = use(SITE_PARTS, { 'base-ui/dialog': dialog, 'base-ui/menu': menu, 'base-ui/select': select, 'base-ui/tooltip': tooltip });
