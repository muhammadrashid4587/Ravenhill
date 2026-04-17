"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const IS_DEV = process.env.NEXT_PUBLIC_APP_ENV !== "production";

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

  // Request-access form state
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [useCase, setUseCase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dev-only seed-agent picker
  const [devOpen, setDevOpen] = useState(false);
  const [seedAgents, setSeedAgents] = useState<SeedAgent[]>([]);

  // Redirect already-authenticated users away from /login.
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

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/request-access`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          company: company.trim() || null,
          role: role.trim() || null,
          use_case: useCase.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail?.[0]?.msg || "Please enter a valid email.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

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
        setError("Dev sign-in failed. Is the API running?");
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
            className="flex items-center gap-2 mb-12 animate-fade-up group"
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

          {submitted ? (
            <div className="animate-fade-up">
              <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
                Thanks — we&apos;ll be in touch.
              </h1>
              <p className="text-sm text-smoke leading-relaxed mb-6">
                Ravenhill is in early access. A founder reviews every
                request personally. If we&apos;re a fit for your team, you
                will receive an invite link at{" "}
                <span className="text-parchment">{email}</span> within a
                few days.
              </p>
              <p className="text-[11px] text-dusk leading-relaxed">
                Already have an invite?{" "}
                <span className="text-smoke">
                  Click the link in your email — it signs you in directly.
                </span>
              </p>
            </div>
          ) : (
            <>
              <h1
                className="text-2xl font-display font-normal tracking-tight text-bone mb-2 animate-fade-up"
                style={{ animationDelay: "50ms" }}
              >
                Request access
              </h1>
              <p
                className="text-sm text-smoke mb-8 animate-fade-up"
                style={{ animationDelay: "100ms" }}
              >
                Ravenhill is in early access with a small group of design
                partners. Tell us about yourself and we&apos;ll get in touch.
              </p>

              <form
                onSubmit={handleSubmitRequest}
                className="space-y-3 animate-fade-up"
                style={{ animationDelay: "150ms" }}
              >
                <div>
                  <label className="block text-xs text-smoke mb-1.5">
                    Work email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
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
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
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
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    placeholder="e.g. Finance spends hours every week answering the same questions across teams…"
                    rows={3}
                    className={inputCls}
                  />
                </div>
                {error && (
                  <p className="text-xs text-claret">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={!email.trim() || submitting}
                  className="w-full btn btn-primary text-sm py-2.5 mt-2"
                >
                  {submitting ? "Submitting…" : "Request access"}
                </button>
              </form>

              <p
                className="text-[11px] text-dusk mt-6 leading-relaxed animate-fade-in"
                style={{ animationDelay: "260ms" }}
              >
                Already have an invite?{" "}
                <span className="text-smoke">
                  Click the link in your email.
                </span>{" "}
                <Link
                  href="/trust"
                  className="underline-offset-4 hover:underline hover:text-smoke"
                >
                  What we collect
                </Link>
                .
              </p>
            </>
          )}

          {IS_DEV && !submitted && (
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
