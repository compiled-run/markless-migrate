import { flag } from 'flags/next';

export const showBanner = flag({ key: 'banner', decide: () => false });
