"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { fetchWorkspaceCalendar } from "@/lib/api";
import type { CalendarEvent, MeetingProvider } from "@/lib/types";

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

function meetingProviderOf(url?: string | null): "Google Meet" | "Zoom" | "Video call" {
  if (!url) return "Video call";
  if (/meet\.google\.com/i.test(url)) return "Google Meet";
  if (/(^|\.)zoom\.us\//i.test(url)) return "Zoom";
  return "Video call";
}

const POLL_INTERVAL_MS = 60_000;

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

  // Live calendar fetch — re-poll every minute so the page reflects the
  // user's actual Google Calendar without manual refresh.
  useEffect(() => {
    if (!myAgent) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = (await fetchWorkspaceCalendar(myAgent.id)) as CalendarEvent[];
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
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [myAgent]);

  // Group events by day, dropping anything that ended more than 30 min ago.
  const upcomingByDay = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 60_000);
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

  if (!myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white">
        <p className="text-sm text-zinc-500 mb-4">Sign in to view your meetings</p>
        <Link
          href="/login"
          className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition press-scale"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const providerInfo = PROVIDER_LINKS[provider];
  const totalEvents = upcomingByDay.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold font-display">Meetings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Live calendar — start, join, or import a transcript
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

      {/* Quick meeting bar */}
      <div className="px-6 pt-5">
        <div className="bg-surface border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium">Quick meeting</span>
            </div>
            <div className="flex items-center gap-1 bg-elevated rounded-lg p-0.5">
              {(Object.keys(PROVIDER_LINKS) as MeetingProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                    provider === p
                      ? "bg-white/[0.1] text-white"
                      : "text-zinc-500 hover:text-zinc-300"
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
              className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-500 px-4 py-3 rounded-lg text-sm font-medium transition text-left"
            >
              <Video className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <div>Start a meeting</div>
                <div className="text-[10px] font-normal text-blue-100/75 mt-0.5">
                  Opens {providerInfo.label} now
                </div>
              </div>
            </button>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2.5 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] px-4 py-3 rounded-lg text-sm font-medium transition text-left"
            >
              <CalendarPlus className="w-4 h-4 shrink-0 text-zinc-400" />
              <div className="min-w-0">
                <div>Create for later</div>
                <div className="text-[10px] font-normal text-zinc-500 mt-0.5">
                  Get a shareable link
                </div>
              </div>
            </button>

            <form
              onSubmit={handleJoin}
              className="flex items-center gap-1 bg-elevated border border-white/[0.1] rounded-lg pl-3 pr-1 py-1 focus-within:border-blue-500 transition"
            >
              <LogIn className="w-4 h-4 shrink-0 text-zinc-400" />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder={`Join: ${providerInfo.joinHint}`}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-zinc-600 min-w-0"
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

      {/* Upcoming from your calendar — live, polled every minute */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-300">From your calendar</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {lastSynced
                ? `Synced ${lastSynced.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every minute`
                : "Live from Google Calendar"}
            </p>
          </div>
          <span className="text-[11px] text-zinc-600">
            {totalEvents} {totalEvents === 1 ? "event" : "events"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : upcomingByDay.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-elevated border border-white/[0.1] flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-zinc-600" />
            </div>
            <h2 className="text-base font-medium mb-1 font-display">No upcoming meetings</h2>
            <p className="text-sm text-zinc-500 max-w-sm mb-6">
              Connect Google Calendar in settings, or import a transcript to get
              started. Zoom meetings on your calendar show up here too.
            </p>
            <Link
              href="/meetings/new"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Import transcript
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {upcomingByDay.map(({ day, items }) => (
              <section key={day.toISOString()}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h3 className="text-[13px] font-semibold text-white">
                    {dayLabel(day, new Date())}
                  </h3>
                  <span className="text-[11px] text-zinc-600">
                    {day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {items.map((ev) => {
                    const eventProvider = meetingProviderOf(ev.meeting_url);
                    return (
                      <div
                        key={ev.id}
                        className="bg-surface border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-4 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="text-sm font-medium text-white truncate">
                                {ev.title}
                              </h4>
                              {ev.meeting_url && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-zinc-300 border border-white/[0.1] shrink-0">
                                  {eventProvider}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-[11px] text-zinc-500 mb-2 flex-wrap">
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
                              <p className="text-[12px] text-zinc-400 leading-relaxed line-clamp-3 whitespace-pre-line mb-2">
                                {ev.description}
                              </p>
                            )}

                            {ev.meeting_url && (
                              <a
                                href={ev.meeting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-md transition"
                              >
                                Join {eventProvider}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
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
                <p className="text-xs text-zinc-500 mt-0.5">
                  {providerInfo.label} · share this with attendees
                </p>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-zinc-500 hover:text-white transition"
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
                className="flex-1 text-center bg-blue-600 hover:bg-blue-500 text-sm px-4 py-2 rounded-lg font-medium transition"
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
