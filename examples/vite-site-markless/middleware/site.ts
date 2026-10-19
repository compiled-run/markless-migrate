import type { MiddlewareHttpContext } from "@markless/router";
import serve from "../public/serve.json" with { type: "json" };
import { currentUser, hasStagingPass } from "../lib/session.ts";
import { PAGES, type NewsItem } from "../lib/site.ts";

const config: {
  redirects?: Record<string, string>;
  negotiate?: Record<string, Record<string, string>>;
  forms?: Record<string, string>;
} = serve;

const CHALLENGE =
  '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta name="robots" content="noindex,nofollow"></head><body><noscript>Enable JavaScript and cookies to continue</noscript><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=8d2f00000000"></script></body></html>';

const redirect = (status: number, location: string, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { location, ...headers } });

async function cmsJson<T>(path: string): Promise<T | undefined> {
  const base = process.env.CMS_URL;
  if (!base) return undefined;
  try {
    const response = await fetch(`${base}${path}`);
    return response.ok ? ((await response.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

export default async function site(http: MiddlewareHttpContext) {
  const { request, locals } = http;
  const pass = process.env.BOT_WALL;
  if (pass && !hasStagingPass(request, pass)) {
    return new Response(CHALLENGE, {
      status: 403,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cf-mitigated": "challenge",
        "cf-ray": "8d2f00000000-LHR",
        server: "cloudflare",
      },
    });
  }
  const path = decodeURIComponent(http.url.pathname);
  if (request.method === "POST" && path === "/api/login") return undefined;

  const user = currentUser(request);
  if (user) locals.user = user;
  if (path.startsWith("/members/") || path.startsWith("/admin/")) {
    if (!user) return redirect(302, "/login/");
    if (path.startsWith("/admin/") && user.role !== "admin") locals.forbidden = true;
  }
  if (locals.forbidden) return undefined;

  const form = config.forms?.[path];
  if (request.method === "POST" && form) return redirect(303, form);

  const negotiated = config.negotiate?.[path];
  if (negotiated) {
    const wanted = (request.headers.get("accept-language") ?? "")
      .split(",")
      .map((part) => part.split(";")[0]!.trim().slice(0, 2).toLowerCase());
    const locale = wanted.find((lang) => lang in negotiated);
    if (locale && negotiated[locale])
      return redirect(302, negotiated[locale], { vary: "Accept-Language" });
  }

  const moved = config.redirects?.[path];
  if (moved) return redirect(301, moved);
  if (!path.endsWith("/") && PAGES[`${path}/`]) return redirect(301, `${path}/`);

  if (path === "/") {
    const [news, settings] = await Promise.all([
      cmsJson<{ items: NewsItem[] }>("/walks/news?fields=title,summary,slug&locale=en"),
      cmsJson<{ tagline: string }>("/walks/settings"),
    ]);
    locals.cms = {
      url: process.env.CMS_URL ?? "",
      news: news?.items ?? [],
      tagline: settings?.tagline ?? "",
    };
  }
  return undefined;
}
