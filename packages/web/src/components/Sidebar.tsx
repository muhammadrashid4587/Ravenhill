"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Building2,
  CalendarCheck,
} from "lucide-react";
import { useAgent } from "@/lib/AgentContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/organization", label: "Organization", icon: Building2 },
  { href: "/meetings", label: "Meetings", icon: CalendarCheck },
];

const DEPT_COLORS: Record<string, string> = {
  Executive: "bg-amber-500",
  Sales: "bg-blue-500",
  Finance: "bg-purple-500",
  Marketing: "bg-emerald-500",
  Engineering: "bg-orange-500",
  Product: "bg-pink-500",
  Operations: "bg-cyan-500",
  HR: "bg-teal-500",
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
  const { myAgent } = useAgent();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#0c0c0e]/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2 group shrink-0">
            <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M13 3L4 14h7v7l9-11h-7V3z" fill="#09090b" />
              </svg>
            </div>
            <span className="text-sm font-display font-semibold text-zinc-100 tracking-tight">
              Ravenhill
            </span>
          </Link>

          {/* Nav items */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-200 ${
                    active
                      ? "text-white bg-white/[0.08]"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-blue-400" : ""}`} />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: User */}
        {myAgent && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-zinc-500">{myAgent.role}</span>
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full ${DEPT_COLORS[myAgent.departments?.[0]] ?? "bg-zinc-600"} flex items-center justify-center text-[9px] font-bold text-white`}
              >
                {getInitials(myAgent.name)}
              </div>
              <span className="text-xs font-medium text-zinc-200">
                {myAgent.name}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
