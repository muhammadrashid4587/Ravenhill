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
  high: "bg-[rgba(201,68,58,0.10)] text-[#E68A82] border-[rgba(201,68,58,0.28)]",
  medium: "bg-[rgba(201,138,43,0.10)] text-[#E6BA75] border-[rgba(201,138,43,0.28)]",
  low: "bg-white/[0.04] text-parchment border-white/[0.08]",
};

const STATUS_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-smoke",
  in_progress: "text-claret",
  done: "text-[#3FA46A]",
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
      <div className="flex flex-col items-center justify-center h-screen bg-obsidian text-parchment px-6">
        <p className="text-sm text-smoke mb-4">Sign in to access your dashboard</p>
        <Link
          href="/login"
          className="btn btn-primary text-sm px-5 py-2.5"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-5 animate-fade-up">
        <h1 className="text-lg font-semibold text-bone">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {myAgent.name.split(" ")[0]}
        </h1>
        <p className="text-xs text-smoke mt-0.5">
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
            {[
              { href: "/chat", icon: MessageSquare, label: "Chat", desc: "Ask your agent anything" },
              { href: "/meetings/new", icon: CalendarCheck, label: "New meeting", desc: "Import & extract tasks" },
              { href: "/organization", icon: Building2, label: "Organization", desc: "See the team" },
            ].map(({ href, icon: Icon, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="group bg-ink border border-white/[0.06] hover:border-white/[0.14] rounded-xl p-4 transition card-lift card-glow glow-brand animate-fade-up"
              >
                <Icon className="w-5 h-5 text-smoke group-hover:text-claret transition mb-2" strokeWidth={1.75} />
                <div className="text-sm font-medium text-bone">{label}</div>
                <div className="text-[11px] text-dusk">{desc}</div>
              </Link>
            ))}
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-5 gap-6">
            {/* Left: Tasks */}
            <div className="col-span-3 animate-fade-up" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-parchment">
                  Your Tasks
                  {allTasks.length > 0 && (
                    <span className="ml-2 text-xs text-dusk">{allTasks.length} open</span>
                  )}
                </h2>
                <Link
                  href="/meetings"
                  className="text-[11px] text-smoke hover:text-parchment flex items-center gap-1 transition"
                >
                  All meetings <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {allTasks.length === 0 ? (
                <div className="bg-ink border border-white/[0.06] rounded-xl p-8 text-center">
                  <CalendarCheck className="w-8 h-8 text-dusk mx-auto mb-3" />
                  <p className="text-sm text-smoke mb-1">No open tasks</p>
                  <p className="text-[11px] text-dusk mb-4">
                    Import a meeting to extract your tasks automatically
                  </p>
                  <Link
                    href="/meetings/new"
                    className="inline-flex items-center gap-1.5 text-xs text-claret hover:text-claret transition"
                  >
                    <Plus className="w-3 h-3" /> Add a meeting
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 stagger">
                  {allTasks.slice(0, 8).map((task) => {
                    const StatusIcon = STATUS_ICONS[task.status] || Circle;
                    const statusColor = STATUS_COLORS[task.status] || "text-smoke";
                    return (
                      <Link
                        key={task.id}
                        href={`/meetings/${task.meeting_id}`}
                        className="flex items-start gap-3 bg-ink border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-4 py-3 transition card-lift animate-fade-up"
                      >
                        <StatusIcon className={`w-4 h-4 mt-0.5 ${statusColor} shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-bone truncate">{task.title}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium
                              }`}
                            >
                              {task.priority}
                            </span>
                          </div>
                          <span className="text-[11px] text-dusk">from {task.meetingTitle}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {allTasks.length > 8 && (
                    <Link
                      href="/meetings"
                      className="block text-center text-xs text-smoke hover:text-parchment py-2 transition"
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
                  <h2 className="text-sm font-medium text-parchment mb-3">Overview</h2>
                  <div className="grid grid-cols-2 gap-2 stagger">
                    <div className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-bone">{stats.active_agents}</div>
                      <div className="text-[11px] text-dusk">Active agents</div>
                    </div>
                    <div className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-bone">{stats.messages_today}</div>
                      <div className="text-[11px] text-dusk">Messages today</div>
                    </div>
                    <div className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-bone">{stats.pending_approvals}</div>
                      <div className="text-[11px] text-dusk">Pending approvals</div>
                    </div>
                    <div className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5 card-lift animate-fade-up">
                      <div className="text-lg font-semibold text-bone">{stats.auto_resolved}</div>
                      <div className="text-[11px] text-dusk">Auto-resolved</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-parchment">Recent Activity</h2>
                  <Link
                    href="/activity"
                    className="text-[11px] text-smoke hover:text-parchment flex items-center gap-1 transition"
                  >
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                {activity.length === 0 ? (
                  <div className="bg-ink border border-white/[0.06] rounded-lg p-4 text-center">
                    <p className="text-xs text-dusk">No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-1 stagger">
                    {activity.slice(0, 6).map((a) => (
                      <div
                        key={a.id}
                        className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2 card-lift animate-fade-up"
                      >
                        <p className="text-xs text-parchment truncate">{a.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-dusk">{a.from_agent}</span>
                          {a.created_at && (
                            <span className="text-[10px] text-dusk">
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
