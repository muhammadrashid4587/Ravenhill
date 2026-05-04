"use client";

import { useState, useEffect, useCallback } from "react";

import {
  ArrowRight,
  MessageSquare,
  ShieldCheck,
  FileText,
  Search,
} from "lucide-react";
import { fetchActivity, streamActivity } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

type ActivityType = "route" | "answer" | "approval" | "doc_request";

const FILTER_OPTIONS: { label: string; value: ActivityType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Routes", value: "route" },
  { label: "Answers", value: "answer" },
  { label: "Approvals", value: "approval" },
  { label: "Doc Requests", value: "doc_request" },
];

const TYPE_CONFIG: Record<
  string,
  { icon: typeof ArrowRight; color: string; bg: string; dotColor: string; label: string }
> = {
  route: {
    icon: ArrowRight,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    dotColor: "bg-blue-400",
    label: "Route",
  },
  answer: {
    icon: MessageSquare,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    dotColor: "bg-emerald-400",
    label: "Answer",
  },
  approval: {
    icon: ShieldCheck,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    dotColor: "bg-amber-400",
    label: "Approval",
  },
  doc_request: {
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    dotColor: "bg-purple-400",
    label: "Doc Request",
  },
};

interface ActivityEntry {
  id?: string;
  type: string;
  from_agent: string;
  to_agent?: string;
  description: string;
  created_at: string;
  _new?: boolean;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(() => {
    const type = filter === "all" ? undefined : filter;
    fetchActivity(type, 100)
      .then((data) => setItems(data.items ?? []))
      .catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  // SSE real-time subscription
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    function connect() {
      cleanup = streamActivity((entry) => {
        const newEntry = {
          ...(entry as unknown as ActivityEntry),
          _new: true,
        };
        setItems((prev) => {
          const updated = [newEntry, ...prev].slice(0, 100);
          return updated;
        });
        // Remove new flag after animation
        setTimeout(() => {
          setItems((prev) =>
            prev.map((item) =>
              item === newEntry ? { ...item, _new: false } : item,
            ),
          );
        }, 2000);
      });
    }

    connect();

    // Reconnect on close
    const interval = setInterval(() => {
      if (!cleanup) {
        connect();
      }
    }, 5000);

    return () => {
      if (cleanup) cleanup();
      clearInterval(interval);
    };
  }, []);

  const filtered = items.filter((item) => {
    if (filter !== "all" && item.type !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.description.toLowerCase().includes(q) ||
        item.from_agent.toLowerCase().includes(q) ||
        (item.to_agent ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-8 max-w-5xl page-gradient">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Activity
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-live" />
              <span className="text-xs text-emerald-400">Live</span>
            </div>
          </div>
          <p className="text-sm text-zinc-500">
            Real-time agent event stream
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-white/[0.15] transition"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                filter === opt.value
                  ? "bg-white/[0.08] text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="glass rounded-xl overflow-hidden">
        {filtered.length > 0 ? (
          <div>
            {filtered.map((item, i) => {
              const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.route;
              return (
                <div
                  key={item.id ?? i}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors ${
                    item._new ? "animate-highlight" : ""
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dotColor}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-300">
                      {item.description}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {item.from_agent}
                      {item.to_agent && (
                        <>
                          {" "}
                          <span className="text-zinc-600">{"\u2192"}</span>{" "}
                          {item.to_agent}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-xs text-zinc-600 min-w-[60px] text-right">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-sm text-dusk">
            No activity yet. Activity will appear here as your agent
            processes requests.
          </div>
        )}
      </div>
    </div>
  );
}
