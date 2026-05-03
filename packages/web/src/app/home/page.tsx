"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  Building2,
  ArrowUpRight,
  Calendar as CalendarIcon,
  Inbox,
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import Button from "@/components/ui/Button";
import DeptAvatar from "@/components/ui/DeptAvatar";
import WeeklyReportModule from "@/components/WeeklyReport";
import {
  fetchInboxTriage,
  fetchPreMeetingBrief,
  fetchWorkspaceCalendar,
  type PreMeetingBrief,
  type TriageItem,
  fetchApprovals,
} from "@/lib/api";
import type { Approval, CalendarEvent } from "@/lib/types";

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

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function urgencyStyle(u: TriageItem["urgency"]): string {
  switch (u) {
    case "now":
      return "bg-claret/15 text-claret border-claret/30";
    case "today":
      return "bg-oxblood/15 text-[#E28A98] border-oxblood/30";
    default:
      return "bg-white/[0.04] text-smoke border-white/[0.08]";
  }
}

function urgencyLabel(u: TriageItem["urgency"]): string {
  return u === "now" ? "Now" : u === "today" ? "Today" : "This week";
}

export default function HomePage() {
  const router = useRouter();
  const { agent: myAgent, loading, logout } = useAuth();

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [triage, setTriage] = useState<TriageItem[] | null>(null);
  const [triageLoading, setTriageLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [brief, setBrief] = useState<PreMeetingBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [approvalsLoading, setApprovalsLoading] = useState(true);

  useEffect(() => {
    if (!myAgent) return;
    setEventsLoading(true);
    fetchWorkspaceCalendar()
      .then((data) => setEvents((data || []) as CalendarEvent[]))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));

    setTriageLoading(true);
    fetchInboxTriage()
      .then((res) => setTriage(res.items || []))
      .catch(() => setTriage([]))
      .finally(() => setTriageLoading(false));

    setApprovalsLoading(true);
    fetchApprovals()
      .then((items) => setApprovals(items || []))
      .catch(() => setApprovals([]))
      .finally(() => setApprovalsLoading(false));
  }, [myAgent]);

  const pendingApprovals = useMemo(
    () => (approvals || []).filter((a) => a.status === "pending"),
    [approvals],
  );

  const todaysEvents = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    const s = startOfDay(now).getTime();
    const e = endOfDay(now).getTime();
    return events
      .filter((ev) => {
        const t = new Date(ev.start_time).getTime();
        return !Number.isNaN(t) && t >= s && t <= e;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
  }, [events]);

  const nextEvent = useMemo(() => {
    if (!events) return null;
    const now = Date.now();
    const upcoming = [...events]
      .filter((ev) => {
        const t = new Date(ev.start_time).getTime();
        return !Number.isNaN(t) && t >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
    return upcoming[0] || null;
  }, [events]);

  const openBrief = async (eventId: string) => {
    if (!myAgent) return;
    setBriefLoading(true);
    setBriefError(null);
    setBrief(null);
    try {
      const res = await fetchPreMeetingBrief(eventId);
      setBrief(res);
    } catch {
      setBriefError(
        "Couldn't build a brief right now. Try again in a moment.",
      );
    } finally {
      setBriefLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center">
        <div className="text-sm text-dusk">Loading…</div>
      </div>
    );
  }

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
          <span className="w-px h-4 bg-white/[0.08] mx-1" />
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            className="text-[11px] text-smoke hover:text-parchment transition px-2 py-1"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Hero header */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-12 pb-6">
        <div className="animate-fade-up">
          <div className="eyebrow mb-3">Your workspace</div>
          <h1 className="text-3xl md:text-4xl font-display font-normal tracking-tight text-bone mb-2">
            What do you need,{" "}
            <span className="display-italic text-claret">{firstName}?</span>
          </h1>
          <p className="text-sm text-smoke">
            {nextEvent ? (
              <>
                Your next meeting is{" "}
                <span className="text-parchment">{nextEvent.title}</span> at{" "}
                <span className="text-parchment">
                  {formatTime(nextEvent.start_time)}
                </span>
                .
              </>
            ) : (
              <>Your agent is ready. Pick where you want to go.</>
            )}
          </p>
        </div>
      </div>

      {/* Two-up: Today's agenda + Inbox triage */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Today's agenda */}
          <div
            className="bg-ink border border-white/[0.06] rounded-2xl p-5 animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarIcon
                  className="w-4 h-4 text-claret"
                  strokeWidth={1.75}
                />
                <h2 className="text-[13px] font-medium text-bone">
                  Today&apos;s agenda
                </h2>
              </div>
              <Link
                href="/calendar"
                className="text-[11px] text-dusk hover:text-smoke transition"
              >
                Open calendar ›
              </Link>
            </div>

            {eventsLoading ? (
              <p className="text-xs text-dusk">Loading events…</p>
            ) : todaysEvents.length === 0 ? (
              <p className="text-xs text-dusk leading-relaxed">
                Nothing on the calendar for today. Go make something.
              </p>
            ) : (
              <ul className="space-y-2">
                {todaysEvents.slice(0, 4).map((ev) => (
                  <li key={ev.id}>
                    <button
                      onClick={() => openBrief(ev.id)}
                      className="w-full text-left group flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition"
                    >
                      <span className="text-[11px] font-mono text-smoke w-[54px] pt-0.5 shrink-0">
                        {formatTime(ev.start_time)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-parchment truncate">
                          {ev.title}
                        </div>
                        {ev.attendees && ev.attendees.length > 0 && (
                          <div className="text-[11px] text-dusk truncate">
                            {ev.attendees.length}{" "}
                            {ev.attendees.length === 1 ? "attendee" : "attendees"}
                          </div>
                        )}
                      </div>
                      <Sparkles
                        className="w-3.5 h-3.5 text-dusk group-hover:text-claret transition mt-0.5 shrink-0"
                        strokeWidth={1.75}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {todaysEvents.length > 0 && (
              <p className="text-[11px] text-dusk mt-4 leading-relaxed">
                Tap an event for a pre-meeting brief — your agent pulls the
                context.
              </p>
            )}
          </div>

          {/* Inbox triage */}
          <div
            className="bg-ink border border-white/[0.06] rounded-2xl p-5 animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-claret" strokeWidth={1.75} />
                <h2 className="text-[13px] font-medium text-bone">
                  Needs you today
                </h2>
              </div>
              <Link
                href="/inbox"
                className="text-[11px] text-dusk hover:text-smoke transition"
              >
                Open inbox ›
              </Link>
            </div>

            {triageLoading ? (
              <p className="text-xs text-dusk">
                Agent is reading your inbox…
              </p>
            ) : !triage || triage.length === 0 ? (
              <p className="text-xs text-dusk leading-relaxed">
                Nothing burning in your inbox. Enjoy it.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {triage.map((it) => (
                  <li key={it.thread_id}>
                    <a
                      href={it.thread_url || "#"}
                      target={it.thread_url ? "_blank" : undefined}
                      rel={it.thread_url ? "noopener noreferrer" : undefined}
                      className="block group p-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition"
                    >
                      <div className="flex items-start gap-2 mb-1">
                        <span
                          className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${urgencyStyle(it.urgency)}`}
                        >
                          {urgencyLabel(it.urgency)}
                        </span>
                        <div className="text-[13px] text-parchment truncate flex-1">
                          {it.subject || "(no subject)"}
                        </div>
                      </div>
                      <div className="text-[11px] text-smoke leading-relaxed">
                        {it.reason}
                      </div>
                      {it.from && (
                        <div className="text-[10px] text-dusk mt-0.5 truncate">
                          {it.from}
                        </div>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Approvals — pending requests waiting on you */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pb-4">
        <div
          className="bg-ink border border-white/[0.06] rounded-2xl p-5 animate-fade-up"
          style={{ animationDelay: "180ms" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className="w-4 h-4 text-claret"
                strokeWidth={1.75}
              />
              <h2 className="text-[13px] font-medium text-bone">Approvals</h2>
              {!approvalsLoading && pendingApprovals.length > 0 && (
                <span className="text-[10px] font-mono text-dusk">
                  {pendingApprovals.length}
                </span>
              )}
            </div>
            <Link
              href="/approvals"
              className="text-[11px] text-dusk hover:text-smoke transition"
            >
              Open approvals ›
            </Link>
          </div>

          {approvalsLoading ? (
            <p className="text-xs text-dusk">Checking pending requests…</p>
          ) : pendingApprovals.length === 0 ? (
            <p className="text-xs text-dusk leading-relaxed">
              Nothing waiting for you. Standing permissions keep this inbox
              light.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {pendingApprovals.slice(0, 4).map((a) => (
                <li key={a.id}>
                  <Link
                    href="/approvals"
                    className="block group p-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition"
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 bg-claret/15 text-claret border-claret/30">
                        Pending
                      </span>
                      <div className="text-[13px] text-parchment truncate flex-1">
                        {a.resource}
                      </div>
                    </div>
                    <div className="text-[11px] text-smoke leading-relaxed">
                      {a.requester_name} wants to share with{" "}
                      {a.target_name === "You" ? "you" : a.target_name}
                    </div>
                    {a.context && (
                      <div className="text-[10px] text-dusk mt-0.5 truncate">
                        {a.context}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Weekly Report — sits above Chat / Meetings / Organization
          destinations, per the product spec. Self-renders empty state
          when behavior_events table has nothing. */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-2 pb-4">
        <WeeklyReportModule />
      </div>

      {/* Destinations */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pb-16 pt-2">
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

      {/* Pre-meeting brief modal */}
      {(brief || briefLoading || briefError) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-obsidian/80 backdrop-blur-sm animate-fade-in"
          onClick={() => {
            setBrief(null);
            setBriefError(null);
            setBriefLoading(false);
          }}
        >
          <div
            className="relative w-full max-w-lg bg-ink border border-white/[0.08] rounded-2xl p-6 shadow-2xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setBrief(null);
                setBriefError(null);
                setBriefLoading(false);
              }}
              className="absolute top-4 right-4 w-7 h-7 rounded-md hover:bg-white/[0.04] flex items-center justify-center text-dusk hover:text-parchment transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-claret" strokeWidth={1.75} />
              <span className="text-[11px] uppercase tracking-wider text-dusk">
                Pre-meeting brief
              </span>
            </div>

            {briefLoading && (
              <div>
                <div className="h-5 bg-white/[0.04] rounded w-2/3 mb-3 animate-pulse" />
                <div className="h-3 bg-white/[0.04] rounded w-full mb-2 animate-pulse" />
                <div className="h-3 bg-white/[0.04] rounded w-5/6 mb-2 animate-pulse" />
                <div className="h-3 bg-white/[0.04] rounded w-4/6 animate-pulse" />
              </div>
            )}

            {briefError && !briefLoading && (
              <p className="text-sm text-claret">{briefError}</p>
            )}

            {brief && !briefLoading && (
              <>
                <h3 className="text-lg font-display font-normal text-bone mb-1">
                  {brief.event.title}
                </h3>
                <p className="text-[12px] text-smoke mb-5">
                  {formatTime(brief.event.start_time)}
                  {brief.event.attendees.length > 0 && (
                    <> · {brief.event.attendees.length} attendees</>
                  )}
                </p>

                <ol className="space-y-3 mb-5">
                  {brief.bullets.map((b, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-[11px] font-mono text-claret mt-0.5">
                        0{i + 1}
                      </span>
                      <span className="text-[13px] text-parchment leading-relaxed">
                        {b}
                      </span>
                    </li>
                  ))}
                </ol>

                {brief.related_threads.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-4">
                    <div className="text-[10px] uppercase tracking-wider text-dusk mb-2">
                      Context pulled from inbox
                    </div>
                    <ul className="space-y-1.5">
                      {brief.related_threads.map((t) => (
                        <li key={t.id}>
                          <a
                            href={t.thread_url || "#"}
                            target={t.thread_url ? "_blank" : undefined}
                            rel={t.thread_url ? "noopener noreferrer" : undefined}
                            className="text-[11px] text-smoke hover:text-parchment transition block truncate"
                          >
                            · {t.subject}{" "}
                            <span className="text-dusk">— {t.from}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {brief.event.meeting_url && (
                  <a
                    href={brief.event.meeting_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 btn btn-primary text-[12px] px-4 py-2 inline-flex"
                  >
                    Join meeting
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
