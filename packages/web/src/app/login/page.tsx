"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

const PROD_API = "https://ravenhill-api.fly.dev";
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (
      host === "raven-hill.org" ||
      host === "www.raven-hill.org" ||
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

const SESSION_COOKIE = "ravenhill_session";
function setMiddlewareCookie(token: string) {
  if (typeof document === "undefined") return;
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

const IS_DEV = process.env.NEXT_PUBLIC_APP_ENV !== "production";

type Mode = "signin" | "signup";

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

  const initialMode: Mode =
    searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [devOpen, setDevOpen] = useState(false);
  const [seedAgents, setSeedAgents] = useState<SeedAgent[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (agent) {
      const from = searchParams.get("from") || "/home";
      router.replace(from);
    }
  }, [agent, authLoading, router, searchParams]);

  useEffect(() => {
    if (!devOpen || seedAgents.length > 0) return;
    (async () => {
      try {
        const res = await fetch(`${resolveApiBase()}/api/agents`, {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body: Record<string, string> = {
        email: email.trim(),
        password,
      };
      if (mode === "signup" && name.trim()) {
        body.name = name.trim();
      }
      const res = await fetch(`${resolveApiBase()}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code =
          typeof data.detail === "string" ? data.detail : "";
        if (code === "email_taken") {
          setError(
            "An account with this email already exists. Try signing in instead.",
          );
        } else if (code === "invalid_credentials") {
          setError("Wrong email or password.");
        } else if (code === "account_deactivated") {
          setError(
            "This account has been deactivated. Reach out to your admin.",
          );
        } else if (res.status === 422) {
          setError("Password must be at least 8 characters.");
        } else {
          setError("Something went wrong. Try again.");
        }
        return;
      }
      const data = await res.json();
      if (data && typeof data.session_token === "string") {
        setMiddlewareCookie(data.session_token);
      }
      await refresh();
      const from = searchParams.get("from") || "/home";
      router.push(from);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevSignIn = useCallback(
    async (agentId: string) => {
      try {
        const res = await fetch(
          `${resolveApiBase()}/api/auth/dev-login?agent_id=${agentId}`,
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

  const isSignup = mode === "signup";

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

          <div
            className="mb-6 inline-flex items-center gap-1 p-1 rounded-lg bg-ink border border-white/[0.06] animate-fade-up"
            style={{ animationDelay: "40ms" }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
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
                setMode("signup");
                setError(null);
              }}
              className={`text-[12px] px-3 py-1.5 rounded-md transition ${
                mode === "signup"
                  ? "bg-white/[0.06] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              Create account
            </button>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <h1 className="text-2xl font-display font-normal tracking-tight text-bone mb-2">
              {isSignup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-smoke mb-8">
              {isSignup
                ? "Sign up with your work email. Your agent will be set up on first sign-in."
                : "Sign in with your email and password."}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignup && (
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
              )}
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
                  autoComplete="email"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-smoke mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "At least 8 characters" : "Your password"}
                  required
                  minLength={isSignup ? 8 : 1}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  className={inputCls}
                />
              </div>
              {error && <p className="text-xs text-claret">{error}</p>}
              <button
                type="submit"
                disabled={!email.trim() || !password || submitting}
                className="w-full btn btn-primary text-sm py-2.5 mt-2"
              >
                {submitting
                  ? isSignup
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignup
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>
            <p className="text-[11px] text-dusk mt-6 leading-relaxed">
              {isSignup ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                    }}
                    className="text-smoke hover:text-parchment underline-offset-4 hover:underline"
                  >
                    Sign in
                  </button>
                  .
                </>
              ) : (
                <>
                  New here?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                    className="text-smoke hover:text-parchment underline-offset-4 hover:underline"
                  >
                    Create an account
                  </button>
                  .
                </>
              )}
            </p>
          </div>

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

          {IS_DEV && (
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
