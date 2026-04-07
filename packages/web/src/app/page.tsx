"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className="flex flex-col h-screen relative overflow-hidden"
      style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}
    >
      {/* Ambient background */}
      <div className="ambient-bg">
        <div className="ambient-orb ambient-orb--purple" />
        <div className="ambient-orb ambient-orb--pink" />
        <div className="ambient-orb ambient-orb--indigo" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6 animate-fade-up">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
            <path
              d="M13 3L4 14h7v7l9-11h-7V3z"
              fill="url(#bolt-landing)"
            />
            <defs>
              <linearGradient
                id="bolt-landing"
                x1="4"
                y1="3"
                x2="20"
                y2="21"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#a855f7" />
                <stop offset="1" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ letterSpacing: "-0.03em" }}
          >
            RavenHill
          </h1>
        </div>

        {/* Tagline */}
        <p
          className="text-lg mb-2 animate-fade-up text-center max-w-md"
          style={{
            color: "var(--text-secondary)",
            animationDelay: "100ms",
          }}
        >
          Every employee gets an AI agent.
          <br />
          The agents talk to each other.
        </p>

        <p
          className="text-sm mb-12 animate-fade-up"
          style={{
            color: "var(--text-tertiary)",
            animationDelay: "200ms",
          }}
        >
          No meetings. No Slack threads. No ask chains.
        </p>

        {/* CTA buttons */}
        <div
          className="flex gap-4 animate-fade-up"
          style={{ animationDelay: "350ms" }}
        >
          <button
            onClick={() => router.push("/demo")}
            className="px-8 py-3.5 rounded-xl font-medium text-sm text-white transition-all duration-200 active:scale-[0.96] min-w-[180px]"
            style={{
              background: "var(--gradient-hot)",
              boxShadow:
                "0 0 24px var(--glow-pink), 0 0 48px var(--glow-purple)",
            }}
          >
            Start Demo
          </button>

          <button
            onClick={() => router.push("/approval")}
            className="px-8 py-3.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-[0.96] min-w-[180px]"
            style={{
              background: "transparent",
              border: "1px solid var(--border-glow)",
              color: "var(--text-secondary)",
            }}
          >
            Open Approval Screen
          </button>
        </div>

        {/* Subtle hint */}
        <p
          className="text-[11px] mt-16 animate-fade-up"
          style={{
            color: "var(--text-tertiary)",
            animationDelay: "500ms",
          }}
        >
          Demo runs two screens: the COO chat + the approval card
        </p>
      </div>
    </div>
  );
}
