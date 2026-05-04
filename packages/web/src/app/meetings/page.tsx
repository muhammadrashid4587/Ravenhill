"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Calendar,
  Clock,
  Users,
  Video,
  CalendarPlus,
  LogIn,
  Copy,
  Check,
  X,
  ExternalLink,
  Bell,
  BellOff,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchGoogleStatus,
  fetchWorkspaceCalendar,
  type GoogleStatus,
} from "@/lib/api";
import type { CalendarEvent, MeetingProvider } from "@/lib/types";
import { useReminders } from "@/lib/RemindersContext";

// Deep-link targets for each provider. No API creation — these open the
// provider's own start/create/join flow in a new tab.
const PROVIDER_LINKS: Record<
  MeetingProvider,
  { label: string; start: string; create: string; joinRoot: (code: string) => string; joinHint: string }
> = {
  google_meet: {
    label: "Google Meet",
    start: "https://meet.google.com/new",
    create: "https://calendar.google.com/calendar/r/eventedit?add=meet",
    joinRoot: (code) => `https://meet.google.com/${code}`,
    joinHint: "abc-defg-hij",
  },
  zoom: {
    label: "Zoom",
    start: "https://zoom.us/start/videomeeting",
    create: "https://zoom.us/meeting/schedule",
    joinRoot: (code) => `https://zoom.us/j/${encodeURIComponent(code)}`,
    joinHint: "123 4567 8901",
  },
};

function generateMeetCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

function generateZoomId(): string {
  const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

const REMINDER_OPTIONS = [
  { label: "5 min before", minutes: 5 },
  { label: "10 min before", minutes: 10 },
  { label: "30 min before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayLabel(date: Date, today: Date): string {
  const d0 = startOfDay(date).getTime();
  const t0 = startOfDay(today).getTime();
  const diff = Math.round((d0 - t0) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function timeRange(start: Date, end: Date): string {
  const fmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, fmt)} – ${end.toLocaleTimeString(undefined, fmt)}`;
}

function isZoomUrl(url?: string | null): boolean {
  return !!url && /(^|\.)zoom\.us\//i.test(url);
}

function meetingProviderOf(url?: string | null): "Google Meet" | "Zoom" | "Video call" {
  if (!url) return "Video call";
  if (/meet\.google\.com/i.test(url)) return "Google Meet";
  if (isZoomUrl(url)) return "Zoom";
  return "Video call";
}

export default function MeetingsPage() {
  const { agent: myAgent } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [provider, setProvider] = useState<MeetingProvider>("google_meet");
  const [joinCode, setJoinCode] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openReminderFor, setOpenReminderFor] = useState<string | null>(null);
  const reminderMenuRef = useRef<HTMLDivElement>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);

  const { scheduleReminder, cancelReminder, hasReminderFor } = useReminders();

  useEffect(() => {
    fetchGoogleStatus()
      .then(setGoogle)
      .catch(() => setGoogle(null));
  }, [myAgent]);

  // Live calendar fetch — re-poll every 60s for "real-time" feel.
  useEffect(() => {
    if (!myAgent) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = (await fetchWorkspaceCalendar()) as CalendarEvent[];
        if (cancelled) return;
        setEvents(Array.isArray(data) ? data : []);
        setLastSynced(new Date());
      } catch {
        if (cancelled) return;
        setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [myAgent]);

  // Close reminder menu on outside click / Esc.
  useEffect(() => {
    if (!openReminderFor) return;
    const onClick = (e: MouseEvent) => {
      if (!reminderMenuRef.current?.contains(e.target as Node)) {
        setOpenReminderFor(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenReminderFor(null);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openReminderFor]);

  const upcomingByDay = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 60_000); // include events that started in the last 30 min
    const within = events
      .map((e) => ({ ...e, _start: new Date(e.start_time), _end: new Date(e.end_time) }))
      .filter((e) => e._end >= cutoff)
      .sort((a, b) => a._start.getTime() - b._start.getTime());

    const groups = new Map<number, typeof within>();
    for (const ev of within) {
      const key = startOfDay(ev._start).getTime();
      const arr = groups.get(key) ?? [];
      arr.push(ev);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, items]) => ({ day: new Date(day), items }));
  }, [events]);

  const handleStart = () => {
    window.open(PROVIDER_LINKS[provider].start, "_blank", "noopener,noreferrer");
  };

  const handleOpenCreate = () => {
    const link =
      provider === "google_meet"
        ? PROVIDER_LINKS.google_meet.joinRoot(generateMeetCode())
        : PROVIDER_LINKS.zoom.joinRoot(generateZoomId().replace(/\s/g, ""));
    setGeneratedLink(link);
    setCopied(false);
    setCreateModalOpen(true);
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors; the link is still visible in the modal.
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    const href = /^https?:\/\//i.test(code)
      ? code
      : PROVIDER_LINKS[provider].joinRoot(code.replace(/\s/g, ""));
    window.open(href, "_blank", "noopener,noreferrer");
    setJoinCode("");
  };

  const handleSetReminder = (
    ev: CalendarEvent & { _start: Date },
    minutesBefore: number,
  ) => {
    const fireAt = ev._start.getTime() - minutesBefore * 60_000;
    scheduleReminder({
      sourceKey: `event:${ev.id}`,
      title: ev.title,
      body:
        minutesBefore === 0
          ? "Starts now"
          : `Starts in ${minutesBefore} minute${minutesBefore === 1 ? "" : "s"}`,
      fireAt,
      url: ev.meeting_url ?? undefined,
    });
    setOpenReminderFor(null);
  };

  if (!myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-bone">
        <p className="text-sm text-smoke mb-4">Sign in to view your meetings</p>
        <Link
          href="/login"
          className="bg-bone text-obsidian px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition press-scale"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const providerInfo = PROVIDER_LINKS[provider];

  return (
    <div className="min-h-screen bg-obsidian text-bone">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold font-display">Meetings</h1>
          <p className="text-xs text-smoke mt-0.5">
            Live calendar — start, join, or set a reminder
          </p>
        </div>
        <Link
          href="/meetings/new"
          className="flex items-center gap-2 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] px-3.5 py-2 rounded-lg text-xs font-medium transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Import transcript
        </Link>
      </header>

      {/* Quick meeting */}
      <div className="px-6 pt-5">
        <div className="bg-surface border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-smoke" />
              <span className="text-sm font-medium">Quick meeting</span>
            </div>
            <div className="flex items-center gap-1 bg-elevated rounded-lg p-0.5">
              {(Object.keys(PROVIDER_LINKS) as MeetingProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                    provider === p
                      ? "bg-white/[0.1] text-bone"
                      : "text-smoke hover:text-parchment"
                  }`}
                >
                  {PROVIDER_LINKS[p].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <button
              onClick={handleStart}
              className="flex items-center gap-2.5 bg-oxblood hover:bg-claret px-4 py-3 rounded-lg text-sm font-medium transition text-left text-white"
            >
              <Video className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <div>Start a meeting</div>
                <div className="text-[10px] font-normal text-white/75 mt-0.5">
                  Opens {providerInfo.label} now
                </div>
              </div>
            </button>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2.5 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] px-4 py-3 rounded-lg text-sm font-medium transition text-left"
            >
              <CalendarPlus className="w-4 h-4 shrink-0 text-smoke" />
              <div className="min-w-0">
                <div>Create for later</div>
                <div className="text-[10px] font-normal text-smoke mt-0.5">
                  Get a shareable link
                </div>
              </div>
            </button>

            <form
              onSubmit={handleJoin}
              className="flex items-center gap-1 bg-elevated border border-white/[0.1] rounded-lg pl-3 pr-1 py-1 focus-within:border-claret transition"
            >
              <LogIn className="w-4 h-4 shrink-0 text-smoke" />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder={`Join: ${providerInfo.joinHint}`}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-dusk min-w-0"
              />
              <button
                type="submit"
                disabled={!joinCode.trim()}
                className="bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed text-xs px-3 py-1.5 rounded-md transition shrink-0"
              >
                Join
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Upcoming from your calendar — replaces the old imported-transcripts list */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium text-parchment">From your calendar</h2>
            <p className="text-[11px] text-smoke mt-0.5">
              {lastSynced
                ? `Synced ${lastSynced.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every minute`
                : "Live from Google Calendar"}
            </p>
          </div>
          <span className="text-[11px] text-dusk">
            {upcomingByDay.reduce((acc, g) => acc + g.items.length, 0)}{" "}
            {upcomingByDay.reduce((acc, g) => acc + g.items.length, 0) === 1
              ? "event"
              : "events"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : upcomingByDay.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-elevated border border-white/[0.1] flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-dusk" />
            </div>
            {google && !google.connected ? (
              <>
                <h2 className="text-base font-medium mb-1 font-display">
                  Connect Google Calendar
                </h2>
                <p className="text-sm text-smoke max-w-sm mb-6">
                  Connect Google in Settings and your upcoming events will
                  appear here — title, time, attendees, and description, the
                  same detail Google Meet shows.
                </p>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 bg-oxblood hover:bg-claret text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
                  >
                    Open Settings
                  </Link>
                  <Link
                    href="/meetings/new"
                    className="flex items-center gap-2 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] text-parchment px-5 py-2.5 rounded-lg text-sm font-medium transition"
                  >
                    <Plus className="w-4 h-4" />
                    Import a transcript
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-medium mb-1 font-display">No upcoming meetings</h2>
                <p className="text-sm text-smoke max-w-sm mb-6">
                  When events are on your calendar, they show up here with the
                  same detail Google Meet shows — title, time, attendees, and
                  the description.
                </p>
                <Link
                  href="/meetings/new"
                  className="flex items-center gap-2 bg-oxblood hover:bg-claret text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
                >
                  <Plus className="w-4 h-4" />
                  Import a transcript instead
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {upcomingByDay.map(({ day, items }) => (
              <section key={day.toISOString()}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h3 className="text-[13px] font-semibold text-bone">
                    {dayLabel(day, new Date())}
                  </h3>
                  <span className="text-[11px] text-dusk">
                    {day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {items.map((ev) => {
                    const sourceKey = `event:${ev.id}`;
                    const reminderSet = hasReminderFor(sourceKey);
                    const provider = meetingProviderOf(ev.meeting_url);
                    return (
                      <div
                        key={ev.id}
                        className="bg-surface border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-4 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="text-sm font-medium text-bone truncate">
                                {ev.title}
                              </h4>
                              {ev.meeting_url && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-parchment border border-white/[0.1] shrink-0">
                                  {provider}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-[11px] text-smoke mb-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {timeRange(ev._start, ev._end)}
                              </span>
                              {ev.attendees.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {ev.attendees.length}{" "}
                                  {ev.attendees.length === 1 ? "attendee" : "attendees"}
                                </span>
                              )}
                            </div>

                            {ev.description && (
                              <p className="text-[12px] text-parchment/85 leading-relaxed line-clamp-3 whitespace-pre-line mb-2">
                                {ev.description}
                              </p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              {ev.meeting_url && (
                                <a
                                  href={ev.meeting_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[11px] bg-oxblood hover:bg-claret text-white px-2.5 py-1 rounded-md transition"
                                >
                                  Join {provider}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}

                              <div className="relative">
                                {reminderSet ? (
                                  <button
                                    onClick={() => cancelReminder(sourceKey)}
                                    className="inline-flex items-center gap-1.5 text-[11px] bg-[var(--brand-soft)] border border-[var(--brand-ring)] text-[var(--brand-hover)] px-2.5 py-1 rounded-md transition hover:bg-[var(--brand-ring)]"
                                  >
                                    <BellOff className="w-3 h-3" />
                                    Reminder set · cancel
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      setOpenReminderFor(
                                        openReminderFor === ev.id ? null : ev.id,
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 text-[11px] bg-elevated hover:bg-white/[0.08] border border-white/[0.1] text-parchment px-2.5 py-1 rounded-md transition"
                                  >
                                    <Bell className="w-3 h-3" />
                                    Set reminder
                                    <ChevronRight className="w-3 h-3 opacity-60" />
                                  </button>
                                )}
                                {openReminderFor === ev.id && (
                                  <div
                                    ref={reminderMenuRef}
                                    role="menu"
                                    className="absolute left-0 top-full mt-1 w-44 bg-elevated border border-white/[0.1] rounded-lg shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] py-1 z-20 animate-fade-up"
                                    style={{ animationDuration: "140ms" }}
                                  >
                                    {REMINDER_OPTIONS.map((opt) => {
                                      const fireAt =
                                        ev._start.getTime() - opt.minutes * 60_000;
                                      const past = fireAt < Date.now();
                                      return (
                                        <button
                                          key={opt.minutes}
                                          role="menuitem"
                                          disabled={past}
                                          onClick={() =>
                                            handleSetReminder(ev, opt.minutes)
                                          }
                                          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] text-parchment hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition"
                                        >
                                          <span>{opt.label}</span>
                                          {past && (
                                            <span className="text-[10px] text-dusk">past</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {createModalOpen && generatedLink && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="bg-surface border border-white/[0.1] rounded-xl p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-medium">Meeting link ready</h3>
                <p className="text-xs text-smoke mt-0.5">
                  {providerInfo.label} · share this with attendees
                </p>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-smoke hover:text-bone transition"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-elevated border border-white/[0.1] rounded-lg px-3 py-2.5 mb-3">
              <input
                readOnly
                value={generatedLink}
                className="flex-1 bg-transparent text-sm font-mono focus:outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.15] text-xs px-2.5 py-1.5 rounded-md transition shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={generatedLink}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center bg-oxblood hover:bg-claret text-white text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Open now
              </a>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="flex-1 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Save for later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
