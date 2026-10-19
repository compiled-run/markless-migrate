import type { Visitor } from "./site.ts";

export const USERS: Record<string, Visitor & { password: string }> = {
  "sam@lighthouse.example": { name: "Sam", role: "member", password: "night-route" },
  "kit@lighthouse.example": { name: "Kit", role: "admin", password: "godrevy" },
};

function cookieOf(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

export function currentUser(request: Request): Visitor | undefined {
  const value = cookieOf(request, "session");
  const user = value ? USERS[Buffer.from(value, "base64url").toString()] : undefined;
  return user && { name: user.name, role: user.role };
}

export function sessionCookie(email: string): string {
  return `session=${Buffer.from(email).toString("base64url")}; Path=/; HttpOnly; SameSite=Lax`;
}

export function hasStagingPass(request: Request, pass: string): boolean {
  return (
    request.headers.get("x-staging-pass") === pass || cookieOf(request, "staging_pass") === pass
  );
}
