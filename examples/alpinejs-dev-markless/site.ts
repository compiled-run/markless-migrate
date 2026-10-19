import { DOC_HEADS } from './generated/heads.ts';
import { SERVER_HEADS } from './generated/server-heads.ts';

export interface Heading {
  readonly key: number;
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3 | 4;
}

export interface Head {
  readonly title: string;
  readonly description: string;
  readonly image: string;
}

const HEADS: Record<string, Head> = {
  ...DOC_HEADS,
  ...SERVER_HEADS,
  "/": {
    title: "Alpine.js",
    description: "A rugged, minimal framework for composing behavior directly in your markup.",
    image: "https://alpinejs.dev/social.jpg",
  },
};

export function headFor(pathname: string): Head {
  return HEADS[pathname] ?? { title: "Alpine.js", description: "", image: "" };
}

export function normalize(pathname: string | undefined): string {
  return (pathname ?? "/").replace(/\/+$/, "") || "/";
}
