"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const IS_DEV = process.env.NEXT_PUBLIC_APP_ENV !== "production";

type Mode = "signin" | "request";

type SignInResult =
  | { kind: "sent" }
  | { kind: "logged"; devUrl?: string }
  | { kind: "throttled" };

interface SeedAgent {
  id: string;
  name: string;
  role: string;
  departments: string[];
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-obsidian" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { agent, loading: authLoading, refresh } = useAuth();

  // Default mode: signin for returning users; request when linked with ?mode=request
  const initialMode: Mode =
    searchParams.get("mode") === "request" ? "request" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);

  // Shared error + "not admitted" redirect message
  const [notice, setNotice] = useState<string | null>(null);

  // Sign-in state
  const [signinEmail, setSigninEmail] = useState("");
  const [signinSubmitting, setSigninSubmitting] = useState(false);
  const [signinResult, setSigninResult] = useState<SignInResult | null>(null);
  const [signinError, setSigninError] = useState<string | null>(null);

  // Request-access state
  const [reqEmail, setReqEmail] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqCompany, setReqCompany] = useState("");
  const [reqRole, setReqRole] = useState("");
  const [reqUseCase, setReqUseCase] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqSubmitted, setReqSubmitted] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);

  // Dev-only seed-agent picker
  const [devOpen, setDevOpen] = useState(false);
  const [seedAgents, setSeedAgents] = useState<SeedAgent[]>([]);

  // Redirect already-authenticated users.
  useEffect(() => {
    if (authLoading) return;
    if (agent) {
      const from = searchParams.get("from") || "/home";
      router.replace(from);
    }
  }, [agent, authLoading, router, searchParams]);

  // Lazy-load seed agents when the dev picker opens.
  useEffect(() => {
    if (!devOpen || seedAgents.length > 0) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agents`, {
          credentials: "include",
        });
        if (res.ok) {
          const data: SeedAgent[] = await res.json();
          setSeedAgents(data);
        }
      } catch {
        // silent — dev-only affordance
      }
    })();
  }, [devOpen, seedAgents.length]);

  // ----- Sign-in handler -----
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signinEmail.trim()) return;
    setSigninSubmitting(true);
    setSigninError(null);
    setSigninResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/sign-in-request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signinEmail.trim() }),
      });
      if (res.status === 403) {
        // Account admin-disabled.
        setSigninError(
          "This account has been deactivated. Reach out to your admin to restore access.",
        );
        return;
      }
      if (res.status === 429) {
        setSigninResult({ kind: "throttled" });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === "string" ? body.detail : "Sign-in failed.",
        );
      }
      const body = await res.json();
      if (body.status === "sent") {
        setSigninResult({ kind: "sent" });
      } else {
        // "logged" — dev mode. Surface the dev_url so local user can click.
        setSigninResult({ kind: "logged", devUrl: body.dev_url });
      }
    } catch (err) {
      setSigninError(
        err instanceof Error ? err.message : "Sign-in failed. Try again.",
      );
    } finally {
      setSigninSubmitting(false);
    }
  };

  // ----- Request-access handler -----
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqEmail.trim()) return;
    setReqSubmitting(true);
    setReqError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/request-access`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: reqEmail.trim(),
          name: reqName.trim() || null,
          company: reqCompany.trim() || null,
          role: reqRole.trim() || null,
          use_case: reqUseCase.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail?.[0]?.msg || "Please enter a valid email.");
      }
      setReqSubmitted(true);
      setNotice(null);
    } catch (err) {
      setReqError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setReqSubmitting(false);
    }
  };

  // ----- Dev sign-in -----
  const handleDevSignIn = useCallback(
    async (agentId: string) => {
      try {
        const res = await fetch(
          `${API_BASE}/api/auth/dev-login?agent_id=${agentId}`,
          { method: "POST", credentials: "include" },
        );
        if (!res.ok) throw new Error("dev-login failed");
        await refresh();
        const from = searchParams.get("from") || "/home";
        router.push(from);
      } catch {
        setSigninError("Dev sign-in failed. Is the API running?");
      }
    },
    [router, searchParams, refresh],
  );

  const inputCls =
    "w-full bg-ink border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-parchment placeholder:text-dusk focus:outline-none input-focus-glow transition";

  return (
    <div className="min-h-screen bg-obsidian text-parchment flex">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="flex items-center gap-2 mb-10 animate-fade-up group"
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

          {/* Mode toggle — visible unless we're on a terminal success screen */}
          {!(mode === "request" && reqSubmitted) &&
            !(mode === "signin" && signinResult) && (
              <div
                className="mb-6 inline-flex items-center gap-1 p-1 rounded-lg bg-ink border border-white/[0.06] animate-fade-up"
                style={{ animationDelay: "40ms" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setNotice(null);
                  }}
                  className={`text-[12px] px-3 py-1.5 rounded-md transition ${
                    mode === "signin"
                      ? "bg-white/[0.06] text-bone"
                      : "text-smoke hover:text-parchment"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("request");
                    setNotice(null);
                  }}
                  className={`text-[12px] px-3 py-1.5 rounded-md transition ${
                    mode === "request"
                      ? "bg-white/[0.06] text-bone"
                      : "text-smoke hover:text-parchment"
                  }`}
                >
                  Request access
                </button>
              </div>
            )}

          {notice && mode === "request" && !reqSubmitted && (
            <div
              className="mb-5 rounded-lg border border-oxblood/40 bg-oxblood/10 px-3 py-2.5 text-[12px] text-parchment leading-relaxed animate-fade-up"
              style={{ animationDelay: "60ms" }}
            >
              {notice}
            </div>
          )}

          {/* ====== SIGN-IN VIEW ====== */}
          {mode === "signin" && !signinResult && (
            <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
              <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
                Sign in
              </h1>
              <p className="text-sm text-smoke mb-8">
                Enter your email and we&apos;ll send you a one-time sign-in
                link. New accounts are created automatically.
              </p>
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <label className="block text-xs text-smoke mb-1.5">
                    Work email
                  </label>
                  <input
                    type="email"
                    value={signinEmail}
                    onChange={(e) => setSigninEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className={inputCls}
                  />
                </div>
                {signinError && (
                  <p className="text-xs text-claret">{signinError}</p>
                )}
                <button
                  type="submit"
                  disabled={!signinEmail.trim() || signinSubmitting}
                  className="w-full btn btn-primary text-sm py-2.5 mt-2"
                >
                  {signinSubmitting ? "Sending…" : "Send sign-in link"}
                </button>
              </form>
              <p className="text-[11px] text-dusk mt-6 leading-relaxed">
                New here? Just enter your email — we&apos;ll set up your
                agent on first sign-in. Piloting for a team?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("request");
                    setNotice(null);
                  }}
                  className="text-smoke hover:text-parchment underline-offset-4 hover:underline"
                >
                  Request access
                </button>
                .
              </p>
            </div>
          )}

          {/* sign-in results */}
          {mode === "signin" && signinResult?.kind === "sent" && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
                Check your email.
              </h1>
              <p className="text-sm text-smoke leading-relaxed mb-4">
                We sent a sign-in link to{" "}
                <span className="text-parchment">{signinEmail}</span>. Click
                the link to sign in. It&apos;s good for 15 minutes and can be
                used once.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSigninResult(null);
                  setSigninEmail("");
                }}
                className="text-[12px] text-smoke hover:text-parchment underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
            </div>
          )}

          {mode === "signin" && signinResult?.kind === "logged" && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
                Check your email.
              </h1>
              <p className="text-sm text-smoke leading-relaxed mb-4">
                We sent a sign-in link to{" "}
                <span className="text-parchment">{signinEmail}</span>.
              </p>
              {signinResult.devUrl && (
                <div className="rounded-lg border border-oxblood/40 bg-oxblood/10 px-3 py-3 text-[12px] leading-relaxed">
                  <div className="text-bone font-medium mb-1.5">
                    👇 Click this link to sign in
                  </div>
                  <div className="text-dusk text-[10px] mb-2">
                    Dev mode — email not configured, so we&apos;re showing the
                    magic link inline. Production sends this to your inbox.
                  </div>
                  <a
                    href={signinResult.devUrl}
                    className="text-claret hover:text-[#D6596C] underline-offset-4 underline font-mono break-all"
                  >
                    {signinResult.devUrl}
                  </a>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setSigninResult(null);
                  setSigninEmail("");
                }}
                className="text-[12px] text-smoke hover:text-parchment underline-offset-4 hover:underline mt-4"
              >
                Use a different email
              </button>
            </div>
          )}

          {mode === "signin" && signinResult?.kind === "throttled" && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
                Link already sent.
              </h1>
              <p className="text-sm text-smoke leading-relaxed">
                We just sent a sign-in link to{" "}
                <span className="text-parchment">{signinEmail}</span>. Check
                your inbox. If it doesn&apos;t arrive in a minute, try again.
              </p>
            </div>
          )}

          {/* ====== REQUEST-ACCESS VIEW ====== */}
          {mode === "request" && !reqSubmitted && (
            <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
              <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
                Request access
              </h1>
              <p className="text-sm text-smoke mb-8">
                Ravenhill is in early access with a small group of design
                partners. Tell us about yourself and we&apos;ll get in touch.
              </p>
              <form onSubmit={handleRequest} className="space-y-3">
                <div>
                  <label className="block text-xs text-smoke mb-1.5">
                    Work email
                  </label>
                  <input
                    type="email"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-smoke mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    placeholder="Jane Park"
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-smoke mb-1.5">
                      Company
                    </label>
                    <input
                      type="text"
                      value={reqCompany}
                      onChange={(e) => setReqCompany(e.target.value)}
                      placeholder="Acme, Inc."
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-smoke mb-1.5">
                      Role
                    </label>
                    <input
                      type="text"
                      value={reqRole}
                      onChange={(e) => setReqRole(e.target.value)}
                      placeholder="Head of Finance"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-smoke mb-1.5">
                    What are you hoping to solve?{" "}
                    <span className="text-dusk">(optional)</span>
                  </label>
                  <textarea
                    value={reqUseCase}
                    onChange={(e) => setReqUseCase(e.target.value)}
                    placeholder="e.g. Finance spends hours every week answering the same questions across teams…"
                    rows={3}
                    className={inputCls}
                  />
                </div>
                {reqError && <p className="text-xs text-claret">{reqError}</p>}
                <button
                  type="submit"
                  disabled={!reqEmail.trim() || reqSubmitting}
                  className="w-full btn btn-primary text-sm py-2.5 mt-2"
                >
                  {reqSubmitting ? "Submitting…" : "Request access"}
                </button>
              </form>
              <p className="text-[11px] text-dusk mt-6 leading-relaxed">
                Already have access?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setNotice(null);
                  }}
                  className="text-smoke hover:text-parchment underline-offset-4 hover:underline"
                >
                  Sign in
                </button>
                .
              </p>
            </div>
          )}

          {mode === "request" && reqSubmitted && (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
                Thanks — we&apos;ll be in touch.
              </h1>
              <p className="text-sm text-smoke leading-relaxed mb-6">
                Ravenhill is in early access. A founder reviews every request
                personally. If we&apos;re a fit for your team, you will
                receive an invite link at{" "}
                <span className="text-parchment">{reqEmail}</span> within a
                few days.
              </p>
              <p className="text-[11px] text-dusk leading-relaxed">
                Already have an invite?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setReqSubmitted(false);
                    setMode("signin");
                  }}
                  className="text-smoke hover:text-parchment underline-offset-4 hover:underline"
                >
                  Sign in
                </button>
                .
              </p>
            </div>
          )}

          {/* Privacy link always present */}
          <p
            className="text-[11px] text-dusk mt-8 leading-relaxed animate-fade-in"
            style={{ animationDelay: "260ms" }}
          >
            <Link
              href="/trust"
              className="underline-offset-4 hover:underline hover:text-smoke"
            >
              What we collect
            </Link>
          </p>

          {IS_DEV && !reqSubmitted && !signinResult && (
            <div
              className="mt-10 pt-6 border-t border-white/[0.06] animate-fade-in"
              style={{ animationDelay: "340ms" }}
            >
              <button
                type="button"
                onClick={() => setDevOpen((v) => !v)}
                className="text-[11px] text-dusk hover:text-smoke transition flex items-center gap-2"
              >
                <span
                  className={`transition-transform ${devOpen ? "rotate-90" : ""}`}
                >
                  ›
                </span>
                Sign in as a seed agent (development only)
              </button>
              {devOpen && (
                <div className="mt-3 space-y-1.5">
                  {seedAgents.length === 0 ? (
                    <p className="text-[11px] text-dusk">
                      Loading seed agents…
                    </p>
                  ) : (
                    seedAgents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => handleDevSignIn(a.id)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-white/[0.03] transition flex items-center justify-between"
                      >
                        <div>
                          <div className="text-[12px] text-parchment">
                            {a.name}
                          </div>
                          <div className="text-[10px] text-dusk font-mono">
                            {a.role} · {a.departments?.[0] || "—"}
                          </div>
                        </div>
                        <span className="text-[10px] text-dusk">sign in ›</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: editorial panel */}
      <div className="hidden lg:flex flex-1 items-center justify-center border-l border-white/[0.06] bg-ink/60 hero-grid relative overflow-hidden">
        <div
          className="text-center px-12 relative z-10 max-w-sm animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          <div className="w-14 h-14 rounded-2xl bg-oxblood/15 border border-oxblood/30 flex items-center justify-center mx-auto mb-6">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-claret"
            >
              <path d="M12 2L3 12l9 10 9-10L12 2z" />
            </svg>
          </div>
          <p className="text-[15px] text-parchment leading-relaxed font-display">
            One agent. Yours.
          </p>
          <p className="text-sm text-smoke leading-relaxed mt-3">
            It learns your work, handles the coordination, and talks to other
            agents — so you don&apos;t have to.
          </p>
        </div>
      </div>
    </div>
  );
}
