"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAgent } from "@/lib/AgentContext";

export default function LoginPage() {
  const router = useRouter();
  const { setMyAgent } = useAgent();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${API_BASE}/api/agents/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim() || "Employee",
          departments: [department.trim() || "General"],
          knowledge_areas: [],
          knowledge_base: "",
          scopes: ["read:public"],
        }),
      });
      const agent = await res.json();
      setMyAgent(agent);
      router.push("/home");
    } catch {
      setMyAgent({
        id: crypto.randomUUID(),
        name: name.trim(),
        role: role.trim() || "Employee",
        departments: [department.trim() || "General"],
        knowledge_areas: [],
        knowledge_base: "",
        scopes: [],
        is_active: true,
      });
      router.push("/home");
    }
  };

  const handleGoogleSignIn = () => {
    // Placeholder — in production this would be real Google OAuth.
    setName("Muhammad Rashid");
    setEmail("muhammad@company.com");
    setRole("CTO");
    setDepartment("Engineering");
  };

  const inputCls =
    "w-full bg-ink border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-parchment placeholder:text-dusk focus:outline-none input-focus-glow transition";

  return (
    <div className="min-h-screen bg-obsidian text-parchment flex">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center px-6">
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

          <h1
            className="text-2xl font-display font-normal tracking-tight text-bone mb-2 animate-fade-up"
            style={{ animationDelay: "50ms" }}
          >
            Welcome to Ravenhill
          </h1>
          <p
            className="text-sm text-smoke mb-8 animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            Sign in and your personal AI agent will be created for you.
          </p>

          <button
            onClick={handleGoogleSignIn}
            className="w-full btn btn-secondary text-sm py-2.5 mb-6 animate-fade-up"
            style={{ animationDelay: "150ms" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <div
            className="flex items-center gap-3 mb-6 animate-fade-in"
            style={{ animationDelay: "200ms" }}
          >
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[11px] text-dusk uppercase tracking-widest">
              or continue manually
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-3 animate-fade-up"
            style={{ animationDelay: "250ms" }}
          >
            <div>
              <label className="block text-xs text-smoke mb-1.5">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Muhammad Rashid"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-smoke mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-smoke mb-1.5">Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. CTO"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-smoke mb-1.5">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Engineering"
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="w-full btn btn-primary text-sm py-2.5 mt-2"
            >
              {submitting ? "Creating your agent…" : "Sign in"}
            </button>
          </form>

          <p
            className="text-[11px] text-dusk mt-6 text-center animate-fade-in"
            style={{ animationDelay: "350ms" }}
          >
            Your personal agent will be created with your name and role.
          </p>
        </div>
      </div>

      {/* Right: decorative, restrained */}
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
