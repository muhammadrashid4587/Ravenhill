"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  Building2,
  ArrowUpRight,
} from "lucide-react";
import { useAgent } from "@/lib/AgentContext";
import Button from "@/components/ui/Button";
import DeptAvatar from "@/components/ui/DeptAvatar";

const DESTINATIONS = [
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    body: "Your tasks, meetings, activity, and everything that needs your attention.",
  },
  {
    href: "/chat",
    icon: MessageSquare,
    label: "Your agent",
    body: "Talk to your AI agent. It knows your work and reaches out when needed.",
  },
  {
    href: "/organization",
    icon: Building2,
    label: "Organization",
    body: "See everyone in the company. Your agent speaks to theirs — not to them.",
  },
] as const;

export default function HomePage() {
  const router = useRouter();
  const { myAgent } = useAgent();

  if (!myAgent) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center">
        <div className="text-center animate-fade-up">
          <p className="text-sm text-smoke mb-4">You need to sign in first</p>
          <Button onClick={() => router.push("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  const firstName = myAgent.name.split(" ")[0];

  return (
    <div className="min-h-screen bg-obsidian text-parchment hero-grid">
      {/* Top bar */}
      <nav className="relative z-10 max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-md bg-oxblood flex items-center justify-center group-hover:bg-claret transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 12l9 10 9-10L12 2z" fill="#F5F0E6" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-bone">
            Ravenhill
          </span>
        </Link>
        <div className="flex items-center gap-2.5">
          <DeptAvatar name={myAgent.name} size="xs" />
          <span className="text-xs text-parchment">{myAgent.name}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#3FA46A]" />
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-20">
        <div className="text-center mb-14 animate-fade-up">
          <div className="eyebrow mb-3">Your workspace</div>
          <h1 className="text-3xl md:text-4xl font-display font-normal tracking-tight text-bone mb-3">
            What do you need,{" "}
            <span className="display-italic text-claret">{firstName}?</span>
          </h1>
          <p className="text-sm text-smoke max-w-md mx-auto">
            Your agent is ready. Pick where you want to go.
          </p>
        </div>

        {/* Three destinations */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 stagger">
          {DESTINATIONS.map(({ href, icon: Icon, label, body }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="group text-left bg-ink border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.14] card-lift animate-fade-up transition"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="w-10 h-10 rounded-lg bg-graphite border border-white/[0.06] flex items-center justify-center group-hover:border-oxblood/30 transition">
                  <Icon
                    className="w-4 h-4 text-smoke group-hover:text-claret transition"
                    strokeWidth={1.75}
                  />
                </div>
                <ArrowUpRight
                  className="w-4 h-4 text-dusk group-hover:text-claret transition"
                  strokeWidth={1.75}
                />
              </div>
              <h3 className="text-[15px] font-medium text-bone mb-2">
                {label}
              </h3>
              <p className="text-sm text-smoke leading-relaxed">{body}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
