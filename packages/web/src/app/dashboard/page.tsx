"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Clock,
  CalendarCheck,
  MessageSquare,
  Building2,
  ArrowRight,
  Plus,
} from "lucide-react";
import { useAgent } from "@/lib/AgentContext";
import { fetchMeetings, fetchStats, fetchActivity, type Meeting } from "@/lib/api";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const STATUS_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-zinc-500",
  in_progress: "text-blue-400",
  done: "text-emerald-400",
};

interface ActivityItem {
  id: string;
  type: string;
  from_agent: string;
  to_agent?: string;
  description: string;
  created_at?: string;
}

interface Stats {
  active_agents: number;
  messages_today: number;
  pending_approvals: number;
  auto_resolved: number;
}

export default function DashboardPage() {
  const { myAgent } = useAgent();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchStats().catch(() => null),
      fetchActivity(undefined, 8).then((r) => r.items || []).catch(() => []),
      myAgent ? fetchMeetings(myAgent.id).catch(() => []) : Promise.resolve([]),
    ]).then(([s, a, m]) => {
      setStats(s);
      setActivity(a);
      setMeetings(m);
      setLoading(false);
    });
  }, [myAgent]);

  // Collect all open tasks across meetings
  const allTasks = meetings
    .flatMap((m) =>
      m.tasks
        .filter((t) => t.status !== "done")
        .map((t) => ({ ...t, meetingTitle: m.title })),
    )
    .sort((a, b) => {
      const p: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (p[a.priority] ?? 9) - (p[b.priority] ?? 9);
    });

  if (!myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#09090b] text-white px-6">
        <p className="text-sm text-zinc-500 mb-4">Sign in to access your dashboard</p>
        <Link
          href="/login"
          className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition press-scale"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-5 animate-fade-up">
        <h1 className="text-lg font-semibold">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {myAgent.name.split(" ")[0]}
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Here&apos;s what&apos;s on your plate
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-3 stagger">
            <Link
              href="/chat"
              className="group bg-surface border border-white/[0.06] hover:border-blue-500/30 rounded-xl p-4 transition card-lift card-glow glow-blue animate-fade-up"
            >
              <MessageSquare className="w-5 h-5 text-blue-400 mb-2" />
              <div className="text-sm font-medium text-white">Chat</div>
              <div className="text-[11px] text-zinc-600">Ask your agent anything</div>
            </Link>
            <Link
              href="/meetings/new"
              className="group bg-surface border border-white/[0.06] hover:border-emerald-500/30 rounded-xl p-4 transition card-lift card-glow glow-emerald animate-fade-up"
            >
              <CalendarCheck className="w-5 h-5 text-emerald-400 mb-2" />
              <div className="text-sm font-medium text-white">New Meeting</div>
              <div className="text-[11px] text-zinc-600">Import & extract tasks</div>
            </Link>
            <Link
              href="/organization"
              className="group bg-surface border border-white/[0.06] hover:border-violet-500/30 rounded-xl p-4 transition card-lift card-glow glow-violet animate-fade-up"
            >
              <Building2 className="w-5 h-5 text-violet-400 mb-2" />
              <div className="text-sm font-medium text-white">Organization</div>
              <div className="text-[11px] text-zinc-600">See who&apos;s in the team</div>
            </Link>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-5 gap-6">
            {/* Left: Tasks */}
            <div className="col-span-3 animate-fade-up" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-zinc-300">
                  Your Tasks
                  {allTasks.length > 0 && (
                    <span className="ml-2 text-xs text-zinc-600">{allTasks.length} open</span>
                  )}
                </h2>
                <Link
                  href="/meetings"
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition"
                >
                  All meetings <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {allTasks.length === 0 ? (
                <div className="bg-surface border border-white/[0.06] rounded-xl p-8 text-center">
                  <CalendarCheck className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500 mb-1">No open tasks</p>
                  <p className="text-[11px] text-zinc-600 mb-4">
                    Import a meeting to extract your tasks automatically
                  </p>
                  <Link
                    href="/meetings/new"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    <Plus className="w-3 h-3" /> Add a meeting
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 stagger">
                  {allTasks.slice(0, 8).map((task) => {
                    const StatusIcon = STATUS_ICONS[task.status] || Circle;
                    const statusColor = STATUS_COLORS[task.status] || "text-zinc-500";
                    return (
                      <Link
                        key={task.id}
                        href={`/meetings/${task.meeting_id}`}
                        className="flex items-start gap-3 bg-surface border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-4 py-3 transition card-lift animate-fade-up"
                      >
                        <StatusIcon className={`w-4 h-4 mt-0.5 ${statusColor} shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white truncate">{task.title}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium
                              }`}
                            >
                              {task.priority}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-600">from {task.meetingTitle}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {allTasks.length > 8 && (
                    <Link
                      href="/meetings"
                      className="block text-center text-xs text-zinc-500 hover:text-zinc-300 py-2 transition"
                    >
                      +{allTasks.length - 8} more tasks
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Right: Stats + Activity */}
            <div className="col-span-2 space-y-6 animate-fade-up" style={{ animationDelay: "300ms" }}>
              {stats && (
                <div>
                  <h2 className="text-sm font-medium text-zinc-300 mb-3">Overview</h2>
                  <div className="grid grid-cols-2 gap-2 stagger">
                    <div className="bg-surface border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-white">{stats.active_agents}</div>
                      <div className="text-[11px] text-zinc-600">Active agents</div>
                    </div>
                    <div className="bg-surface border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-white">{stats.messages_today}</div>
                      <div className="text-[11px] text-zinc-600">Messages today</div>
                    </div>
                    <div className="bg-surface border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-white">{stats.pending_approvals}</div>
                      <div className="text-[11px] text-zinc-600">Pending approvals</div>
                    </div>
                    <div className="bg-surface border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-white">{stats.auto_resolved}</div>
                      <div className="text-[11px] text-zinc-600">Auto-resolved</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-zinc-300">Recent Activity</h2>
                  <Link
                    href="/activity"
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition"
                  >
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                {activity.length === 0 ? (
                  <div className="bg-surface border border-white/[0.06] rounded-lg p-4 text-center">
                    <p className="text-xs text-zinc-600">No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-1 stagger">
                    {activity.slice(0, 6).map((a) => (
                      <div
                        key={a.id}
                        className="bg-surface border border-white/[0.06] rounded-lg px-3 py-2 card-lift animate-fade-up"
                      >
                        <p className="text-xs text-zinc-400 truncate">{a.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-zinc-600">{a.from_agent}</span>
                          {a.created_at && (
                            <span className="text-[10px] text-zinc-700">
                              {new Date(a.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
