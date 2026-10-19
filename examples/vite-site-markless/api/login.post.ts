import type { EndpointHttpContext } from "@markless/router";
import { USERS, sessionCookie } from "../lib/session.ts";

export default async function login({ request }: EndpointHttpContext) {
  const form = new URLSearchParams(await request.text());
  const email = form.get("email") ?? "";
  const user = USERS[email];
  if (!user || user.password !== form.get("password")) {
    return new Response(null, { status: 303, headers: { location: "/login/?error=1" } });
  }
  return new Response(null, {
    status: 303,
    headers: { location: "/members/", "set-cookie": sessionCookie(email) },
  });
}
