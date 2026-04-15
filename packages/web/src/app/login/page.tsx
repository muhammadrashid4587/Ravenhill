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

    // Create a personal agent for this user via the API
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
      // Fallback: create a local-only agent object
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
    // Placeholder — in production this would be real Google OAuth
    // For demo, pre-fill with a name
    setName("Muhammad Rashid");
    setEmail("muhammad@company.com");
    setRole("CTO");
    setDepartment("Engineering");
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex">
      {/* Left panel */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mb-12 animate-fade-up">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M13 3L4 14h7v7l9-11h-7V3z" fill="#09090b" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight">Ravenhill</span>
          </Link>

          <h1 className="text-2xl font-display font-semibold tracking-tight mb-2 animate-fade-up" style={{ animationDelay: "50ms" }}>
            Welcome to Ravenhill
          </h1>
          <p className="text-sm text-zinc-500 mb-8 animate-fade-up" style={{ animationDelay: "100ms" }}>
            Sign in and your personal AI agent will be created for you.
          </p>

          {/* Google button */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50 text-sm transition press-scale mb-6 animate-fade-up"
            style={{ animationDelay: "150ms" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-6 animate-fade-in" style={{ animationDelay: "200ms" }}>
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">or sign in manually</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Sign in form */}
          <form onSubmit={handleSubmit} className="space-y-3 animate-fade-up" style={{ animationDelay: "250ms" }}>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Muhammad Rashid"
                required
                className="w-full bg-transparent border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none input-focus-glow transition placeholder:text-zinc-700"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-transparent border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none input-focus-glow transition placeholder:text-zinc-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g., CTO"
                  className="w-full bg-transparent border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none input-focus-glow transition placeholder:text-zinc-700"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., Engineering"
                  className="w-full bg-transparent border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none input-focus-glow transition placeholder:text-zinc-700"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 transition press-scale mt-2"
            >
              {submitting ? "Creating your agent..." : "Sign in"}
            </button>
          </form>

          <p className="text-[11px] text-zinc-700 mt-6 text-center animate-fade-in" style={{ animationDelay: "350ms" }}>
            Your personal agent will be created with your name and role.
          </p>
        </div>
      </div>

      {/* Right panel — decorative */}
      <div className="hidden lg:flex flex-1 items-center justify-center border-l border-zinc-900 bg-zinc-950/50 animated-gradient-panel relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="text-center px-12 relative z-10 animate-fade-up" style={{ animationDelay: "300ms" }}>
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
            One agent. Yours. It knows your work, handles your tasks,
            and talks to other agents so you don&apos;t have to.
          </p>
        </div>
      </div>
    </div>
  );
}
