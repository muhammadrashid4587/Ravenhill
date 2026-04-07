"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  Activity,
  Shield,
  Settings,
  ArrowLeftRight,
} from "lucide-react";
import { useAgent } from "@/lib/AgentContext";

const MAIN_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

const MONITOR_NAV = [
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/audit", label: "Audit Log", icon: Shield },
];

const DEPT_COLORS: Record<string, string> = {
  Sales: "bg-blue-500",
  Finance: "bg-purple-500",
  Marketing: "bg-emerald-500",
  Engineering: "bg-orange-500",
  Product: "bg-pink-500",
  HR: "bg-cyan-500",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { myAgent } = useAgent();

  const handlePickAgent = () => {
    router.push("/agents?pick=true");
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <aside className="w-56 border-r border-white/[0.06] bg-white/[0.02] flex flex-col shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="py-5 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-400"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span className="text-base font-bold text-zinc-100 tracking-tight">
            Ravenhill
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto">
        {/* Main nav (no section label) */}
        <div className="space-y-0.5">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Monitor section */}
        <div className="mt-6">
          <div className="text-[11px] font-medium text-zinc-600 uppercase tracking-widest px-3 mb-1">
            Monitor
          </div>
          <div className="space-y-0.5">
            {MONITOR_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-3">
        {/* Settings */}
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
            isActive("/settings")
              ? "bg-white/[0.08] text-white"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </Link>

        {/* Divider */}
        <div className="border-t border-white/[0.06] my-3" />

        {/* Agent selector */}
        {myAgent ? (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div
              className={`w-7 h-7 rounded-full ${DEPT_COLORS[myAgent.departments?.[0]] ?? "bg-zinc-600"} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
            >
              {getInitials(myAgent.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-zinc-200 truncate">
                {myAgent.name}
              </div>
            </div>
            <button
              onClick={handlePickAgent}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition"
              title="Switch agent"
            >
              Switch
            </button>
          </div>
        ) : (
          <button
            onClick={handlePickAgent}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-400 hover:to-violet-400 text-xs font-medium text-white transition"
          >
            Select Agent
          </button>
        )}
      </div>
    </aside>
  );
}
