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
  List,
  LayoutGrid,
  AlertTriangle,
  LayoutDashboard,
  Calendar as CalendarIcon,
  FileText,
  Mail,
  Video,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import ManualTasksPanel from "@/components/ManualTasksPanel";
import {
  fetchMeetings,
  fetchStats,
  fetchActivity,
  fetchWorkspaceCalendar,
  fetchWorkspaceDriveFiles,
  fetchGmailThreads,
  fetchPendingItems,
  type Meeting,
} from "@/lib/api";
import {
  isStale,
  type PendingItem,
  type TaskStatus,
  type CalendarEvent,
  type WorkspaceFile,
  type WorkspaceEmail,
} from "@/lib/types";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-[rgba(220,38,38,0.14)] text-[#F87171] border-[rgba(220,38,38,0.40)]",
  medium: "bg-[rgba(234,179,8,0.14)] text-[#FACC15] border-[rgba(234,179,8,0.40)]",
  low: "bg-white/[0.04] text-parchment border-white/[0.08]",
  done: "bg-[rgba(34,197,94,0.14)] text-[#4ADE80] border-[rgba(34,197,94,0.40)]",
};

function taskChipStyle(item: { status: TaskStatus; priority: string }) {
  if (item.status === "done") return PRIORITY_STYLES.done;
  return PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.medium;
}

function taskChipLabel(item: { status: TaskStatus; priority: string }) {
  return item.status === "done" ? "done" : item.priority;
}

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "text-smoke",
  in_progress: "text-claret",
  done: "text-[#3FA46A]",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To-do",
  in_progress: "In progress",
  done: "Done",
};

const BOARD_COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

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
  const { agent: myAgent } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [workspaceEmails, setWorkspaceEmails] = useState<WorkspaceEmail[]>([]);
  const [view, setView] = useState<"list" | "board">("list");
  const [dashTab, setDashTab] = useState<"overview" | "workspace">("overview");
  const [loading, setLoading] = useState(true);
  const [showOverview, setShowOverview] = useState(true);
  const [showActivity, setShowActivity] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const o = window.localStorage.getItem("dash.showOverview");
    const a = window.localStorage.getItem("dash.showActivity");
    if (o !== null) setShowOverview(o === "1");
    if (a !== null) setShowActivity(a === "1");
  }, []);

  const toggleOverview = () => {
    setShowOverview((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("dash.showOverview", next ? "1" : "0");
      }
      return next;
    });
  };

  const toggleActivity = () => {
    setShowActivity((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("dash.showActivity", next ? "1" : "0");
      }
      return next;
    });
  };

  const sideVisible = showOverview || showActivity;

  useEffect(() => {
    Promise.all([
      fetchStats().catch(() => null),
      fetchActivity(undefined, 8).then((r) => r.items || []).catch(() => []),
      myAgent ? fetchMeetings(myAgent.id).catch(() => []) : Promise.resolve([]),
      fetchPendingItems().catch(() => []),
      // Live Google Workspace — backend falls back to seed data automatically
      // when the agent hasn't connected Google yet, so a [] here means an
      // actual fetch error, not "not connected".
      fetchWorkspaceCalendar().catch(() => []),
      fetchWorkspaceDriveFiles().catch(() => []),
      fetchGmailThreads().catch(() => []),
    ]).then(([s, a, m, p, ce, wf, we]) => {
      setStats(s);
      setActivity(a);
      setMeetings(m);
      setPendingItems(p);
      setCalendarEvents(ce as CalendarEvent[]);
      setWorkspaceFiles(wf as WorkspaceFile[]);
      setWorkspaceEmails(we as WorkspaceEmail[]);
      setLoading(false);
    });
  }, [myAgent]);

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedPending = [...pendingItems].sort(
    (a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9),
  );
  const openPending = sortedPending.filter((p) => p.status !== "done");
  const byStatus: Record<TaskStatus, PendingItem[]> = {
    todo: sortedPending.filter((p) => p.status === "todo"),
    in_progress: sortedPending.filter((p) => p.status === "in_progress"),
    done: sortedPending.filter((p) => p.status === "done"),
  };
  // Meetings link surface kept; full integration via pending items lands when
  // Muhammad ships a unified endpoint.
  void meetings;

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
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone">
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {myAgent.name.split(" ")[0]}
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Here&apos;s what&apos;s on your plate
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Dashboard view"
            className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
          >
            <button
              role="tab"
              aria-selected={dashTab === "overview"}
              onClick={() => setDashTab("overview")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition ${
                dashTab === "overview"
                  ? "bg-white/[0.08] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Overview
            </button>
            <button
              role="tab"
              aria-selected={dashTab === "workspace"}
              onClick={() => setDashTab("workspace")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition ${
                dashTab === "workspace"
                  ? "bg-white/[0.08] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Calendar &amp; Workspace
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      ) : dashTab === "workspace" ? (
        <WorkspacePanel
          events={calendarEvents}
          files={workspaceFiles}
          emails={workspaceEmails}
        />
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

          {/* Two-column layout — side column collapses when both panels hidden */}
          <div
            className={
              sideVisible
                ? "grid grid-cols-5 gap-6"
                : "grid grid-cols-1"
            }
          >
            {/* Left: Tasks */}
            <div
              className={`${sideVisible ? "col-span-3" : "col-span-1"} animate-fade-up`}
              style={{ animationDelay: "200ms" }}
            >
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h2 className="text-sm font-medium text-parchment">
                  Your Tasks
                  {openPending.length > 0 && (
                    <span className="ml-2 text-xs text-dusk">{openPending.length} open</span>
                  )}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <div
                    role="group"
                    aria-label="Panel visibility"
                    className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
                  >
                    <PanelToggle
                      label="Overview"
                      on={showOverview}
                      onClick={toggleOverview}
                    />
                    <PanelToggle
                      label="Activity"
                      on={showActivity}
                      onClick={toggleActivity}
                    />
                  </div>
                  <div
                    role="tablist"
                    aria-label="Task view"
                    className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
                  >
                    <button
                      role="tab"
                      aria-selected={view === "list"}
                      onClick={() => setView("list")}
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition ${
                        view === "list"
                          ? "bg-white/[0.08] text-bone"
                          : "text-smoke hover:text-parchment"
                      }`}
                    >
                      <List className="w-3 h-3" /> List
                    </button>
                    <button
                      role="tab"
                      aria-selected={view === "board"}
                      onClick={() => setView("board")}
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition ${
                        view === "board"
                          ? "bg-white/[0.08] text-bone"
                          : "text-smoke hover:text-parchment"
                      }`}
                    >
                      <LayoutGrid className="w-3 h-3" /> Board
                    </button>
                  </div>
                  <Link
                    href="/meetings"
                    className="text-[11px] text-smoke hover:text-parchment flex items-center gap-1 transition"
                  >
                    All meetings <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* Created Tasks (manual) — sits above the meeting-derived
                  list. Self-renders empty state. */}
              <ManualTasksPanel />

              {sortedPending.length === 0 ? (
                <div className="bg-ink border border-white/[0.06] rounded-xl p-8 text-center">
                  <CalendarCheck className="w-8 h-8 text-dusk mx-auto mb-3" />
                  <p className="text-sm text-smoke mb-1">No meeting-derived tasks</p>
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
              ) : view === "list" ? (
                <div className="space-y-2 stagger">
                  {sortedPending.slice(0, 10).map((item) => (
                    <PendingRow key={item.id} item={item} />
                  ))}
                  {sortedPending.length > 10 && (
                    <Link
                      href="/meetings"
                      className="block text-center text-xs text-smoke hover:text-parchment py-2 transition"
                    >
                      +{sortedPending.length - 10} more tasks
                    </Link>
                  )}
                </div>
              ) : (
                <div className={`grid gap-3 stagger ${sideVisible ? "grid-cols-3" : "grid-cols-3 lg:grid-cols-3"}`}>
                  {BOARD_COLUMNS.map((col) => (
                    <BoardColumn key={col} status={col} items={byStatus[col]} />
                  ))}
                </div>
              )}
            </div>

            {/* Right: Stats + Activity */}
            {sideVisible && (
            <div className="col-span-2 space-y-6 animate-fade-up" style={{ animationDelay: "300ms" }}>
              {showOverview && stats && (
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

              {showActivity && (
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
              )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PanelToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  const Icon = on ? Eye : EyeOff;
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      title={on ? `Hide ${label}` : `Show ${label}`}
      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md transition ${
        on
          ? "bg-white/[0.08] text-bone"
          : "text-smoke hover:text-parchment"
      }`}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}

function PendingRow({ item }: { item: PendingItem }) {
  const StatusIcon = STATUS_ICONS[item.status];
  const statusColor = STATUS_COLORS[item.status];
  const stale = isStale(item);
  return (
    <div className="flex items-start gap-3 bg-ink border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-4 py-3 transition card-lift animate-fade-up">
      <StatusIcon className={`w-4 h-4 mt-0.5 ${statusColor} shrink-0`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-bone truncate">{item.title}</span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded border ${taskChipStyle(item)}`}
          >
            {taskChipLabel(item)}
          </span>
          {stale && (
            <span
              title="Lifespan exceeded"
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border bg-[rgba(234,179,8,0.14)] text-[#FACC15] border-[rgba(234,179,8,0.40)]"
            >
              <AlertTriangle className="w-2.5 h-2.5" /> stale
            </span>
          )}
          {item.ready_state === "not_ready" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-white/[0.02] text-smoke border-white/[0.08]">
              not ready
            </span>
          )}
        </div>
        {item.description && (
          <span className="text-[11px] text-dusk line-clamp-1">{item.description}</span>
        )}
      </div>
    </div>
  );
}

function BoardColumn({ status, items }: { status: TaskStatus; items: PendingItem[] }) {
  const StatusIcon = STATUS_ICONS[status];
  const statusColor = STATUS_COLORS[status];
  return (
    <div className="bg-ink/60 border border-white/[0.06] rounded-xl p-3 min-h-[240px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`w-3.5 h-3.5 ${statusColor}`} />
          <span className="text-xs font-medium text-parchment">
            {STATUS_LABELS[status]}
          </span>
        </div>
        <span className="text-[10px] text-dusk">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-[10px] text-dusk">Empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <BoardCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspacePanel({
  events,
  files,
  emails,
}: {
  events: CalendarEvent[];
  files: WorkspaceFile[];
  emails: WorkspaceEmail[];
}) {
  return (
    <div className="p-6 grid grid-cols-5 gap-6">
      <section
        className="col-span-3 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-parchment flex items-center gap-2">
            <CalendarIcon className="w-3.5 h-3.5 text-smoke" /> Upcoming
          </h2>
          <span className="text-[11px] text-dusk">Google Calendar</span>
        </div>
        {events.length === 0 ? (
          <EmptyCard
            icon={<CalendarIcon className="w-6 h-6 text-dusk mx-auto mb-2" />}
            label="No upcoming meetings"
          />
        ) : (
          <div className="space-y-2 stagger">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-8 mb-3">
          <h2 className="text-sm font-medium text-parchment flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-smoke" /> Recent files
          </h2>
          <span className="text-[11px] text-dusk">Google Drive</span>
        </div>
        {files.length === 0 ? (
          <EmptyCard
            icon={<FileText className="w-6 h-6 text-dusk mx-auto mb-2" />}
            label="No files surfaced yet"
          />
        ) : (
          <div className="space-y-2 stagger">
            {files.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </div>
        )}
      </section>

      <aside
        className="col-span-2 animate-fade-up"
        style={{ animationDelay: "200ms" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-parchment flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-smoke" /> Inbox
          </h2>
          <span className="text-[11px] text-dusk">Gmail</span>
        </div>
        {emails.length === 0 ? (
          <EmptyCard
            icon={<Mail className="w-6 h-6 text-dusk mx-auto mb-2" />}
            label="Inbox zero"
          />
        ) : (
          <div className="space-y-2 stagger">
            {emails.map((m) => (
              <EmailRow key={m.id} email={m} />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function EmptyCard({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="bg-ink border border-white/[0.06] rounded-xl p-6 text-center">
      {icon}
      <p className="text-xs text-smoke">{label}</p>
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const dateLabel = start.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div className="bg-ink border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-4 py-3 transition card-lift animate-fade-up">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center justify-center bg-graphite rounded-md px-2 py-1.5 shrink-0 border border-white/[0.06]">
          <span className="text-[9px] uppercase tracking-wide text-dusk">
            {start.toLocaleDateString([], { month: "short" })}
          </span>
          <span className="text-sm font-semibold text-bone leading-none">
            {start.getDate()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-bone truncate">{event.title}</span>
            {event.has_transcript && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border bg-white/[0.04] text-parchment border-white/[0.08]">
                transcript
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-dusk mt-0.5">
            <span>{dateLabel}</span>
            <span>·</span>
            <span>{timeLabel}</span>
            <span>·</span>
            <span className="truncate">{event.attendees.length} attendees</span>
          </div>
        </div>
        {event.meeting_url && (
          <a
            href={event.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-smoke hover:text-parchment transition shrink-0"
          >
            <Video className="w-3 h-3" /> Join
          </a>
        )}
      </div>
    </div>
  );
}

function FileRow({ file }: { file: WorkspaceFile }) {
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 bg-ink border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-4 py-3 transition card-lift animate-fade-up"
    >
      <FileText className="w-4 h-4 mt-0.5 text-smoke shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-sm text-bone truncate block">{file.name}</span>
        <span className="text-[11px] text-dusk">
          {file.owner} · {new Date(file.last_modified).toLocaleDateString()}
        </span>
      </div>
      <ExternalLink className="w-3 h-3 text-dusk shrink-0 mt-1" />
    </a>
  );
}

function EmailRow({ email }: { email: WorkspaceEmail }) {
  return (
    <a
      href={email.thread_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-ink border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-3 py-2.5 transition card-lift animate-fade-up"
    >
      <div className="flex items-center gap-2">
        {email.unread && (
          <span className="w-1.5 h-1.5 rounded-full bg-claret shrink-0" />
        )}
        <span className="text-xs text-bone truncate flex-1">
          {email.subject}
        </span>
      </div>
      <p className="text-[11px] text-dusk line-clamp-1 mt-0.5">
        {email.from} — {email.snippet}
      </p>
    </a>
  );
}

function BoardCard({ item }: { item: PendingItem }) {
  const stale = isStale(item);
  return (
    <div className="bg-graphite border border-white/[0.06] hover:border-white/[0.14] rounded-lg px-3 py-2.5 transition card-lift">
      <p className="text-xs text-bone leading-snug line-clamp-2">{item.title}</p>
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded border ${taskChipStyle(item)}`}
        >
          {taskChipLabel(item)}
        </span>
        {stale && (
          <span
            title="Lifespan exceeded"
            className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border bg-[rgba(234,179,8,0.14)] text-[#FACC15] border-[rgba(234,179,8,0.40)]"
          >
            <AlertTriangle className="w-2.5 h-2.5" /> stale
          </span>
        )}
        {item.ready_state === "not_ready" && (
          <span className="text-[9px] px-1.5 py-0.5 rounded border bg-white/[0.02] text-smoke border-white/[0.08]">
            not ready
          </span>
        )}
      </div>
    </div>
  );
}
