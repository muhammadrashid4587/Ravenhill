"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";

function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight * 2;
    };
    resize();
    window.addEventListener("resize", resize);

    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.0 + 0.2,
      alpha: Math.random() * 0.5 + 0.05,
      speed: Math.random() * 0.001 + 0.0002,
      phase: Math.random() * Math.PI * 2,
    }));

    let animId: number;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const flicker = Math.sin(t * s.speed + s.phase) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha * flicker})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}

function GlowOrb() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Outer pink/magenta sweep */}
      <div
        className="absolute top-[50%] left-[50%]"
        style={{
          width: "750px",
          height: "750px",
          transform: "translate(-50%, -70%)",
          borderRadius: "50%",
          background: "conic-gradient(from 180deg at 50% 50%, rgba(180, 60, 255, 0.2) 0deg, rgba(255, 80, 200, 0.18) 90deg, rgba(120, 50, 255, 0.22) 180deg, rgba(200, 100, 255, 0.15) 270deg, rgba(180, 60, 255, 0.2) 360deg)",
          filter: "blur(50px)",
          animation: "orb-spin 20s linear infinite",
        }}
      />

      {/* Main purple sphere */}
      <div
        className="absolute top-[50%] left-[50%]"
        style={{
          width: "600px",
          height: "600px",
          transform: "translate(-50%, -70%)",
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.15) 0%, rgba(180, 140, 255, 0.25) 15%, rgba(130, 80, 220, 0.3) 30%, rgba(100, 50, 200, 0.2) 50%, rgba(80, 30, 180, 0.08) 70%, transparent 85%)",
          filter: "blur(8px)",
          animation: "orb-breathe 8s ease-in-out infinite",
        }}
      />

      {/* Inner bright core */}
      <div
        className="absolute top-[50%] left-[50%]"
        style={{
          width: "350px",
          height: "350px",
          transform: "translate(-50%, -75%)",
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.2) 0%, rgba(220, 200, 255, 0.15) 20%, rgba(160, 120, 255, 0.12) 40%, transparent 70%)",
          filter: "blur(15px)",
          animation: "orb-breathe 6s ease-in-out infinite reverse",
        }}
      />

      {/* Hot white center spot */}
      <div
        className="absolute top-[50%] left-[50%]"
        style={{
          width: "120px",
          height: "120px",
          transform: "translate(-50%, -85%)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.25) 0%, rgba(200, 180, 255, 0.1) 40%, transparent 70%)",
          filter: "blur(10px)",
          animation: "orb-breathe 5s ease-in-out infinite",
        }}
      />

      {/* Ambient lower glow (reflects on content below) */}
      <div
        className="absolute top-[50%] left-[50%]"
        style={{
          width: "900px",
          height: "400px",
          transform: "translate(-50%, -40%)",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(130, 80, 220, 0.06) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050507] text-white overflow-hidden">
      <StarField />
      <GlowOrb />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M13 3L4 14h7v7l9-11h-7V3z" fill="#09090b" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">Ravenhill</span>
        </div>
        <Link
          href="/login"
          className="text-sm text-zinc-400 hover:text-white transition"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero — centered */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-28 pb-32">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-xs text-zinc-400 mb-8 animate-fade-up backdrop-blur-sm">
          <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-medium">New</span>
          Personal AI Agents for Enterprise
        </div>

        {/* Heading */}
        <h1 className="text-6xl md:text-7xl font-display font-semibold tracking-tight leading-[1.05] mb-6 animate-fade-up max-w-4xl" style={{ animationDelay: "100ms" }}>
          Your AI agent handles
          <br />
          the coordination.
        </h1>

        {/* Sub */}
        <p className="text-lg text-zinc-500 leading-relaxed mb-10 max-w-xl animate-fade-up" style={{ animationDelay: "200ms" }}>
          Every employee gets a personal AI agent. The agents talk to each
          other — so you can focus on real work.
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-4 animate-fade-up" style={{ animationDelay: "300ms" }}>
          <Link
            href="/login"
            className="group px-7 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition press-scale flex items-center gap-2"
          >
            Get started
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition-transform">
              <path d="M7 17l9.2-9.2M17 17V8H8" />
            </svg>
          </Link>
          <Link
            href="#how-it-works"
            className="px-7 py-3 rounded-lg border border-white/[0.1] bg-white/[0.03] text-sm text-zinc-300 hover:text-white hover:border-white/[0.2] hover:bg-white/[0.05] transition press-scale backdrop-blur-sm"
          >
            How it works
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div id="how-it-works" className="relative z-10 max-w-5xl mx-auto px-6 py-24 border-t border-white/[0.06]">
        <div className="text-center mb-16">
          <p className="text-xs text-violet-400 uppercase tracking-widest mb-3 animate-fade-up">How it works</p>
          <h2 className="text-3xl font-display font-semibold tracking-tight animate-fade-up" style={{ animationDelay: "50ms" }}>
            Three things your agent does for you
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-5 stagger">
          <div className="border border-white/[0.06] bg-white/[0.02] rounded-2xl p-6 card-lift hover-glow animate-fade-up backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-sm font-medium mb-2">Extracts your tasks</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              After every meeting, your agent pulls out the action items,
              priorities, and deadlines — so you know exactly what to do.
            </p>
          </div>

          <div className="border border-white/[0.06] bg-white/[0.02] rounded-2xl p-6 card-lift hover-glow animate-fade-up backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium mb-2">Talks to other agents</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Need a file from another team? Your agent asks their agent.
              No Slack messages, no waiting, no follow-ups.
            </p>
          </div>

          <div className="border border-white/[0.06] bg-white/[0.02] rounded-2xl p-6 card-lift hover-glow animate-fade-up backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <h3 className="text-sm font-medium mb-2">Knows your organization</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Who owns what, who&apos;s available, who to reach out to —
              your agent knows the org so you don&apos;t have to.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 max-w-5xl mx-auto px-6 py-8 border-t border-white/[0.06] flex items-center justify-between">
        <span className="text-xs text-zinc-700">Ravenhill</span>
        <span className="text-xs text-zinc-700">Early access — 2026</span>
      </footer>
    </div>
  );
}
