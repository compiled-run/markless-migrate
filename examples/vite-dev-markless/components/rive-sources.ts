// The animations' files, apart from the Rive runtime, so a page can name them without loading it.
import masthead from '../assets/vite/animations/641_x_629_vite_masthead.riv?url';
import richFeatures from '../assets/vite/animations/563_x_420_rich_features.riv?url';
import flexiblePlugin from '../assets/vite/animations/640_x_300_flexible_plugin.riv?url';

const SOURCES = { masthead, richFeatures, flexiblePlugin };
export type RiveName = keyof typeof SOURCES;
export const riveSource = (name: RiveName): string => SOURCES[name];
