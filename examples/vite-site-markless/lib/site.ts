export const ORIGIN = "https://lighthouse.example";

export type Head = {
  readonly lang: string;
  readonly dir: "ltr" | "rtl";
  readonly title: string;
  readonly description: string;
  readonly robots: string;
  readonly path: string;
  readonly canonical: boolean;
  readonly alternates: boolean;
  readonly feeds: boolean;
};

const page = (
  path: string,
  title: string,
  description: string,
  extra: Partial<Head> = {},
): Head => ({
  lang: "en",
  dir: "ltr",
  title,
  description,
  robots: "index, follow",
  path,
  canonical: true,
  alternates: false,
  feeds: false,
  ...extra,
});

export const PAGES: Readonly<Record<string, Head>> = {
  "/": page(
    "/",
    "Lighthouse Walks: coastal routes in Cornwall",
    "Guided coastal walks between the lighthouses of west Cornwall.",
    {
      alternates: true,
      feeds: true,
    },
  ),
  "/about/": page("/about/", "About | Lighthouse Walks", "Who leads the walks."),
  "/fr/": page(
    "/fr/",
    "Lighthouse Walks : randonnées côtières",
    "Randonnées guidées entre les phares de Cornouailles.",
    {
      lang: "fr",
      alternates: true,
    },
  ),
  "/ar/": page("/ar/", "نزهات المنارات: طرق ساحلية", "نزهات بصحبة مرشدين بين منارات كورنوال.", {
    lang: "ar",
    dir: "rtl",
    alternates: true,
  }),
  "/login/": page("/login/", "Sign in | Lighthouse Walks", "Sign in to your walker account.", {
    robots: "noindex",
  }),
  "/members/": page("/members/", "Members | Lighthouse Walks", "Walks for members.", {
    robots: "noindex",
  }),
  "/admin/": page("/admin/", "Guide admin | Lighthouse Walks", "Plan the walks.", {
    robots: "noindex",
  }),
};

export const FORBIDDEN = page(
  "/403",
  "Guides only | Lighthouse Walks",
  "Only guides can open this page.",
  { robots: "noindex" },
);
export const NOT_FOUND = page(
  "/404",
  "Page not found | Lighthouse Walks",
  "This page does not exist.",
  { canonical: false },
);

export const ALTERNATES: readonly { readonly lang: string; readonly path: string }[] = [
  { lang: "en", path: "/" },
  { lang: "fr", path: "/fr/" },
  { lang: "ar", path: "/ar/" },
  { lang: "x-default", path: "/" },
];

export type NewsItem = { readonly title: string; readonly summary: string };

export type Visitor = { readonly name: string; readonly role: "member" | "admin" };

declare module "@markless/router" {
  interface AppLocals {
    user?: Visitor;
    forbidden?: boolean;
    cms?: { readonly url: string; readonly news: readonly NewsItem[]; readonly tagline: string };
  }
}
