"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { setSessionToken } from "@/lib/session";

const PROD_API = "https://ravenhill-api.fly.dev";
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (
      host === "raven-hill.org" ||
      host === "www.raven-hill.org" ||
      host === "ravenhillai.com" ||
      host === "www.ravenhillai.com" ||
      host.endsWith(".vercel.app")
    ) {
      return PROD_API;
    }
  }
  const fromEnv = (process.env.NEXT_PUBLIC_API_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return fromEnv || "http://localhost:8000";
}
type Status = "verifying" | "success" | "error";

const ERROR_COPY: Record<string, string> = {
  invite_not_found:
    "We couldn't find this invite. The link may be mistyped or was already used.",
  invite_expired:
    "This invite has expired. Ask your contact at Ravenhill for a new one.",
  invite_already_used:
    "This invite has already been used. If you need a new one, reach out.",
};

export default function VerifyInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-obsidian" />}>
      <VerifyInvitePageInner />
    </Suspense>
  );
}

function VerifyInvitePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const triedRef = useRef(false);

  const token = searchParams.get("token") || "";

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;

    if (!token) {
      setStatus("error");
      setErrorMsg("No invite token in this link.");
      return;
    }

    (async () => {
      try {
        const apiBase = resolveApiBase();
        const res = await fetch(`${apiBase}/api/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const code = typeof body.detail === "string" ? body.detail : "";
          setErrorMsg(
            ERROR_COPY[code] ||
              "We couldn't sign you in with this link. Try again.",
          );
          setStatus("error");
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (body && typeof body.session_token === "string") {
          // Mirror on the frontend domain so the Next middleware
          // presence-check can see a cookie (the HttpOnly cross-site
          // cookie set by the API is invisible to middleware).
          setSessionToken(body.session_token);
        }
        await refresh();
        setStatus("success");
        // Short pause so the user sees the "signed in" state, then /home.
        setTimeout(() => router.replace("/home"), 600);
      } catch {
        setErrorMsg(
          "We couldn't reach the server. Check your connection and retry.",
        );
        setStatus("error");
      }
    })();
  }, [token, router, refresh]);

  return (
    <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 mb-10 group"
        >
          <div className="w-7 h-7 rounded-md bg-oxblood flex items-center justify-center group-hover:bg-claret transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 12l9 10 9-10L12 2z" fill="#F5F0E6" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-bone">
            Ravenhill
          </span>
        </Link>

        {status === "verifying" && (
          <div className="animate-fade-up">
            <h1 className="text-xl font-display font-normal text-bone mb-2">
              Signing you in…
            </h1>
            <p className="text-sm text-smoke">
              Verifying your invite link.
            </p>
            <div className="mt-6 inline-flex gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full bg-smoke animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-smoke animate-bounce"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-smoke animate-bounce"
                style={{ animationDelay: "240ms" }}
              />
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="animate-fade-up">
            <h1 className="text-xl font-display font-normal text-bone mb-2">
              Welcome back.
            </h1>
            <p className="text-sm text-smoke">Taking you to your home…</p>
          </div>
        )}

        {status === "error" && (
          <div className="animate-fade-up">
            <h1 className="text-xl font-display font-normal text-bone mb-3">
              Sign-in failed
            </h1>
            <p className="text-sm text-smoke leading-relaxed mb-6">
              {errorMsg}
            </p>
            <Link href="/login" className="btn btn-secondary text-sm px-4 py-2">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
