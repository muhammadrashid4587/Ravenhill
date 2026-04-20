"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Building2,
  CalendarDays,
  LogOut,
  ShieldCheck,
  MoreHorizontal,
  CalendarCheck,
  HardDriveUpload,
  Brain,
  Inbox,
  Settings,
  Network,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import DeptAvatar from "@/components/ui/DeptAvatar";

const PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/organization", label: "Organization", icon: Building2 },
];

const SECONDARY_NAV = [
  { href: "/meetings", label: "Meetings", icon: CalendarCheck },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/drive", label: "Drive", icon: HardDriveUpload },
  { href: "/knowledge", label: "Knowledge", icon: Brain },
  { href: "/expertise", label: "Expertise map", icon: Network },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { agent: myAgent, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const secondaryActive = SECONDARY_NAV.some((n) => isActive(n.href));

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-obsidian/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Left: logo + nav */}
        <div className="flex items-center gap-8">
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

          <div className="flex items-center gap-0.5">
            {PRIMARY_NAV.map((item) => {
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

            {/* More popover */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-200 ${
                  moreOpen || secondaryActive
                    ? "text-bone bg-white/[0.06]"
                    : "text-smoke hover:text-parchment hover:bg-white/[0.04]"
                }`}
              >
                <MoreHorizontal
                  className={`w-4 h-4 ${secondaryActive ? "text-claret" : ""}`}
                  strokeWidth={1.75}
                />
                <span>More</span>
                {secondaryActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-oxblood rounded-full" />
                )}
              </button>

              {moreOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1.5 w-52 bg-obsidian border border-white/[0.08] rounded-lg shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] py-1 animate-fade-up"
                  style={{ animationDuration: "140ms" }}
                >
                  {SECONDARY_NAV.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className={`flex items-center gap-2.5 px-3 py-2 text-[13px] transition ${
                          active
                            ? "text-bone bg-white/[0.06]"
                            : "text-smoke hover:text-parchment hover:bg-white/[0.04]"
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${active ? "text-claret" : "text-dusk"}`}
                          strokeWidth={1.75}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: user + logout menu */}
        {myAgent && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-white/[0.04] transition"
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
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
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg border border-white/[0.08] bg-ink shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] overflow-hidden animate-fade-up">
                <div className="px-3 py-2.5 border-b border-white/[0.06]">
                  <div className="text-[12px] text-parchment truncate">
                    {myAgent.name}
                  </div>
                  <div className="text-[10px] text-dusk font-mono truncate">
                    {myAgent.email || "no email"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-smoke hover:text-bone hover:bg-white/[0.04] transition"
                >
                  <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
