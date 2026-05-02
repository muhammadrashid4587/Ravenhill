"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, KeyRound } from "lucide-react";

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

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"form" | "ok" | "fail">("form");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${resolveApiBase()}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (res.ok) {
        setStatus("ok");
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("fail");
        setError(
          data.detail === "token_expired"
            ? "This reset link has expired. Request a new one."
            : data.detail === "token_invalid"
              ? "Invalid reset link. It may have already been used."
              : data.detail || "Reset failed.",
        );
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center p-6">
        <div className="bg-ink border border-white/[0.08] rounded-2xl p-8 max-w-md w-full text-center">
          <XCircle className="w-8 h-8 text-[color:var(--danger)] mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-bone">No reset token</h1>
          <p className="text-xs text-smoke mt-2">
            This page requires a reset link from your email.
          </p>
          <Link href="/login" className="inline-block mt-4 text-sm text-oxblood hover:text-claret transition">
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center p-6">
      <div className="bg-ink border border-white/[0.08] rounded-2xl p-8 max-w-md w-full">
        {status === "ok" ? (
          <div className="text-center">
            <CheckCircle2 className="w-8 h-8 text-[#4ADE80] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-bone">Password updated</h1>
            <p className="text-xs text-smoke mt-2">
              Sign in with your new password.
            </p>
            <Link href="/login" className="inline-block mt-4 text-sm text-oxblood hover:text-claret transition">
              Go to sign in →
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="w-5 h-5 text-oxblood" />
              <h1 className="text-lg font-semibold text-bone">
                Choose a new password
              </h1>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (8+ characters)"
                minLength={8}
                required
                className="w-full bg-graphite border border-[color:var(--border)] rounded-lg px-3.5 py-2.5 text-sm text-parchment placeholder:text-dusk focus:outline-none focus:border-oxblood transition"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                minLength={8}
                required
                className="w-full bg-graphite border border-[color:var(--border)] rounded-lg px-3.5 py-2.5 text-sm text-parchment placeholder:text-dusk focus:outline-none focus:border-oxblood transition"
              />
              {error && (
                <p className="text-[12px] text-[color:var(--danger)]">{error}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-oxblood hover:bg-claret text-bone rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  "Reset password"
                )}
              </button>
            </form>
            <Link href="/login" className="block text-center mt-4 text-[12px] text-smoke hover:text-parchment transition">
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-obsidian" />}>
      <ResetInner />
    </Suspense>
  );
}
