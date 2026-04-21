"use client";

const SESSION_COOKIE = "ravenhill_session";

export function setSessionToken(token: string) {
  if (typeof document === "undefined" || !token) return;
  const onHttps = window.location.protocol === "https:";
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${60 * 60 * 24 * 30}`,
    "SameSite=Lax",
    onHttps ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  document.cookie = attrs;
}

export function clearSessionToken() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readSessionToken(): string {
  if (typeof document === "undefined") return "";
  const prefix = `${SESSION_COOKIE}=`;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  if (!match) return "";
  return decodeURIComponent(match.slice(prefix.length));
}
