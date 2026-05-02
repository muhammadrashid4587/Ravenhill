"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"working" | "ok" | "fail">("working");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("fail");
      setDetail("No verification token found in the URL.");
      return;
    }
    fetch(`${resolveApiBase()}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("ok");
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("fail");
          setDetail(data.detail || "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("fail");
        setDetail("Couldn't reach the server.");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center p-6">
      <div className="bg-ink border border-white/[0.08] rounded-2xl p-8 max-w-md w-full text-center">
        {status === "working" && (
          <>
            <Loader2 className="w-8 h-8 text-oxblood animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-bone">Verifying…</h1>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="w-8 h-8 text-[#4ADE80] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-bone">Email verified</h1>
            <p className="text-xs text-smoke mt-2">
              Your email is confirmed. You can close this tab.
            </p>
            <Link
              href="/home"
              className="inline-block mt-4 text-sm text-oxblood hover:text-claret transition"
            >
              Go to Ravenhill →
            </Link>
          </>
        )}
        {status === "fail" && (
          <>
            <XCircle className="w-8 h-8 text-[color:var(--danger)] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-bone">
              Verification failed
            </h1>
            <p className="text-xs text-smoke mt-2">{detail}</p>
            <Link
              href="/login"
              className="inline-block mt-4 text-sm text-oxblood hover:text-claret transition"
            >
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

const PROD_API = "https://ravenhill-api.fly.dev";
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (
      host === "raven-hill.org" || host === "www.raven-hill.org" ||
      host === "ravenhillai.com" || host === "www.ravenhillai.com" ||
      host.endsWith(".vercel.app")
    ) return PROD_API;
  }
  return (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "") || "http://localhost:8000";
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-obsidian" />}>
      <VerifyInner />
    </Suspense>
  );
}
