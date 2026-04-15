"use client";

import { useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAgent } from "@/lib/AgentContext";

function TiltCard({
  children,
  className,
  glowClass,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  glowClass?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (y - 0.5) * -6;
    const rotateY = (x - 0.5) * 6;
    el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px)";
  }, []);

  return (
    <button
      onClick={onClick}
      className={`text-left ${glowClass || ""}`}
    >
      <div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`${className || ""} transition-[transform,box-shadow] duration-300 ease-out will-change-transform`}
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
      </div>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { myAgent } = useAgent();

  // If no agent (somehow got here without login), redirect
  if (!myAgent) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
        <div className="text-center animate-fade-up">
          <p className="text-sm text-zinc-500 mb-4">You need to sign in first</p>
          <button
            onClick={() => router.push("/login")}
            className="px-5 py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition press-scale"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const firstName = myAgent.name.split(" ")[0];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Top bar */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M13 3L4 14h7v7l9-11h-7V3z" fill="#09090b" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">Ravenhill</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {myAgent.name}
        </div>
      </nav>

      {/* Center content */}
      <div className="max-w-4xl mx-auto px-6 pt-20">
        <div className="text-center mb-16 animate-fade-up">
          <h1 className="text-3xl font-display font-semibold tracking-tight mb-3">
            What do you need, {firstName}?
          </h1>
          <p className="text-sm text-zinc-500">
            Your agent is ready. Pick where you want to go.
          </p>
        </div>

        {/* Three cards */}
        <div className="grid grid-cols-3 gap-4 stagger">
          <TiltCard
            onClick={() => router.push("/dashboard")}
            glowClass="card-glow glow-blue animate-fade-up"
            className="group border border-zinc-800/60 rounded-2xl p-6 hover:border-zinc-700 hover:bg-zinc-900/30 h-full"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5 group-hover:border-zinc-700 transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400 group-hover:text-blue-400 transition">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <h3 className="text-base font-medium mb-1.5 group-hover:text-white transition">
              Dashboard
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Your tasks, meetings, activity, and everything that needs your attention.
            </p>
          </TiltCard>

          <TiltCard
            onClick={() => router.push("/chat")}
            glowClass="card-glow glow-emerald animate-fade-up"
            className="group border border-zinc-800/60 rounded-2xl p-6 hover:border-zinc-700 hover:bg-zinc-900/30 h-full"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5 group-hover:border-zinc-700 transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400 group-hover:text-emerald-400 transition">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
              </svg>
            </div>
            <h3 className="text-base font-medium mb-1.5 group-hover:text-white transition">
              Your Agent
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Talk to your AI agent. It knows your work and reaches out to others when needed.
            </p>
          </TiltCard>

          <TiltCard
            onClick={() => router.push("/organization")}
            glowClass="card-glow glow-violet animate-fade-up"
            className="group border border-zinc-800/60 rounded-2xl p-6 hover:border-zinc-700 hover:bg-zinc-900/30 h-full"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5 group-hover:border-zinc-700 transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400 group-hover:text-violet-400 transition">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <h3 className="text-base font-medium mb-1.5 group-hover:text-white transition">
              Organization
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              See everyone in the company. Your agent reaches out to theirs — no direct interruptions.
            </p>
          </TiltCard>
        </div>
      </div>
    </div>
  );
}
