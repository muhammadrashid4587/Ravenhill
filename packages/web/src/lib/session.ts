"use client";

const SESSION_COOKIE = "ravenhill_session";
const SESSION_STORAGE_KEY = "ravenhill_session_token";

// Mirror the session token into localStorage in addition to the cookie.
// Mobile Safari occasionally drops document.cookie writes that happen
// right after a cross-origin fetch — the localStorage copy survives that
// path so subsequent X-Session-Token requests still authenticate, and a
// page reload can rehydrate the cookie from it.
function writeLocalStorage(token: string) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_STORAGE_KEY, token);
    }
  } catch {
    /* localStorage unavailable (private mode, quota) — fall through */
  }
}

function clearLocalStorage() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readLocalStorage(): string {
  try {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

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
  writeLocalStorage(token);
}

export function clearSessionToken() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  clearLocalStorage();
}

export function readSessionToken(): string {
  if (typeof document === "undefined") return "";
  const prefix = `${SESSION_COOKIE}=`;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  if (match) {
    return decodeURIComponent(match.slice(prefix.length));
  }
  // Cookie went missing (mobile Safari quirk, expired, etc.) but
  // localStorage may still have it. Re-prime the cookie so middleware
  // route protection works on the next navigation.
  const stored = readLocalStorage();
  if (stored) {
    const onHttps =
      typeof window !== "undefined" &&
      window.location.protocol === "https:";
    const attrs = [
      `${SESSION_COOKIE}=${encodeURIComponent(stored)}`,
      "Path=/",
      `Max-Age=${60 * 60 * 24 * 30}`,
      "SameSite=Lax",
      onHttps ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    document.cookie = attrs;
    return stored;
  }
  return "";
}
