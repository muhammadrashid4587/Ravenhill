"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Activity,
  Settings,
  Zap,
  ArrowLeftRight,
  ShieldAlert,
} from "lucide-react";
import { useAgent } from "@/lib/AgentContext";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/audit", label: "Audit Log", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
];

const DEPT_COLORS: Record<string, string> = {
  Sales: "from-blue-500 to-blue-700",
  Finance: "from-purple-500 to-purple-700",
  Marketing: "from-emerald-500 to-emerald-700",
  Engineering: "from-orange-500 to-orange-700",
  Product: "from-pink-500 to-pink-700",
  HR: "from-cyan-500 to-cyan-700",
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

  return (
    <aside className="w-56 border-r border-gray-800 bg-gray-950 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Ravenhill</div>
            <div className="text-[10px] text-gray-500">Agent Platform</div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? "bg-blue-600/10 text-blue-400 font-medium"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer — Agent Identity */}
      <div className="px-4 py-4 border-t border-gray-800">
        {myAgent ? (
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full bg-gradient-to-br ${DEPT_COLORS[myAgent.departments?.[0]] ?? "from-gray-500 to-gray-700"} flex items-center justify-center text-[11px] font-bold text-white shrink-0`}
            >
              {getInitials(myAgent.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">
                {myAgent.name}
              </div>
              <div className="text-[10px] text-gray-500 truncate">
                {myAgent.role}
              </div>
            </div>
            <button
              onClick={handlePickAgent}
              className="text-gray-500 hover:text-white transition shrink-0"
              title="Switch agent"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={handlePickAgent}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-700 text-xs text-gray-400 hover:text-white hover:border-gray-500 transition"
          >
            Select your agent
          </button>
        )}
      </div>
    </aside>
  );
}
