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
import DeptAvatar from "@/components/ui/DeptAvatar";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/organization", label: "Organization", icon: Building2 },
  { href: "/meetings", label: "Meetings", icon: CalendarCheck },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { myAgent } = useAgent();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-obsidian/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Left: logo + nav */}
        <div className="flex items-center gap-6">
          <Link href="/home" className="flex items-center gap-2 group shrink-0">
            <div className="w-6 h-6 rounded-md bg-oxblood flex items-center justify-center group-hover:bg-claret transition">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 12l9 10 9-10L12 2z" fill="#F5F0E6" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-bone tracking-tight">
              Ravenhill
            </span>
          </Link>

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
                      ? "text-bone bg-white/[0.06]"
                      : "text-smoke hover:text-parchment hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${active ? "text-claret" : ""}`}
                    strokeWidth={1.75}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-oxblood rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: user */}
        {myAgent && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-smoke hidden sm:block">
              {myAgent.role}
            </span>
            <div className="flex items-center gap-2">
              <DeptAvatar name={myAgent.name} size="xs" />
              <span className="text-xs font-medium text-parchment">
                {myAgent.name}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#3FA46A]"
                aria-label="active"
              />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
