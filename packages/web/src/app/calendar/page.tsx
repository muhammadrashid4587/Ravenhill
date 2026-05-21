"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Video,
  Bell,
  BellOff,
  AlertCircle,
  Flag,
  CheckCircle2,
  CheckSquare,
  PenLine,
  BellRing,
  Focus,
  Plus,
  Trash2,
  X,
  Cake,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  createTimeBlock,
  deleteTimeBlock,
  fetchBirthdays,
  fetchGoogleStatus,
  fetchMeetings,
  fetchTimeBlocks,
  fetchWorkspaceCalendar,
  type BirthdayContact,
  type GoogleStatus,
  type Meeting,
  type TimeBlock,
  type TimeBlockKind,
} from "@/lib/api";
import { fetchPendingItems } from "@/lib/mocks";
import type { CalendarEvent, PendingItem } from "@/lib/types";

type ViewMode = "month" | "week" | "list" | "board" | "agenda";
type CalendarSource = "google" | "microsoft_teams";

const VIEW_TABS: Array<{ id: ViewMode; label: string }> = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "agenda", label: "Agenda" },
];

type EventPriority = "high" | "low";

type CalendarItem =
  | {
      kind: "event";
      id: string;
      title: string;
      start: Date;
      end: Date;
      meeting_url?: string;
      attendees: number;
      has_transcript?: boolean;
      eventPriority: EventPriority;
    }
  | {
      kind: "deadline";
      id: string;
      title: string;
      start: Date;
      end: Date;
      priority: "high" | "medium" | "low";
      status: "todo" | "in_progress" | "done";
    }
  | {
      kind: "block";
      id: string;
      title: string;
      start: Date;
      end: Date;
      blockId: string;
      blockKind: TimeBlockKind;
      synced_to_google: boolean;
      notes: string | null;
    }
  | {
      kind: "birthday";
      id: string;
      title: string;
      start: Date;
      end: Date;
      email: string;
      age: number | null;
    };

const BLOCK_KIND_LABEL: Record<TimeBlockKind, string> = {
  focus: "Focus",
  deep_work: "Deep work",
  buffer: "Buffer",
  personal: "Personal",
};

type ActionKind = "attend" | "note_taker" | "reminder";
type ActionItem = {
  id: string;
  kind: ActionKind;
  event_id: string;
  event_title: string;
  event_start: Date;
  reason: string;
};

const HIGH_KEYWORDS = [
  "1:1",
  "1-1",
  "review",
  "decision",
  "demo",
  "interview",
  "exec",
  "board",
  "kickoff",
  "launch",
  "all hands",
];

function eventPriorityFor(args: {
  title: string;
  attendees: number;
  meeting_url?: string;
}): EventPriority {
  const t = args.title.toLowerCase();
  if (HIGH_KEYWORDS.some((k) => t.includes(k))) return "high";
  if (args.meeting_url && args.attendees > 0 && args.attendees <= 5) return "high";
  return "low";
}

function deriveActionItems(
  items: CalendarItem[],
  fromDay: Date,
  now: Date,
): ActionItem[] {
  const windowStart = startOfDay(fromDay).getTime();
  const windowEnd = startOfDay(addDays(fromDay, 3)).getTime();
  const out: ActionItem[] = [];

  const events = items.filter(
    (i): i is Extract<CalendarItem, { kind: "event" }> => i.kind === "event",
  );

  for (const ev of events) {
    const t = ev.start.getTime();
    if (t < windowStart || t >= windowEnd) continue;

    if (ev.eventPriority === "high" && t >= now.getTime()) {
      out.push({
        id: `attend:${ev.id}`,
        kind: "attend",
        event_id: ev.id,
        event_title: ev.title,
        event_start: ev.start,
        reason: "High priority — be there in person if you can.",
      });
    }

    // Note-taker for medium/large meetings without an existing transcript
    if (!ev.has_transcript && ev.attendees >= 3 && t >= now.getTime()) {
      out.push({
        id: `notes:${ev.id}`,
        kind: "note_taker",
        event_id: ev.id,
        event_title: ev.title,
        event_start: ev.start,
        reason: `${ev.attendees} attendees — your agent should capture decisions and action items.`,
      });
    }

    // Reminder for high-priority items starting within the next 24 hours
    const minsToStart = Math.round((t - now.getTime()) / 60_000);
    if (
      ev.eventPriority === "high" &&
      minsToStart > 0 &&
      minsToStart <= 24 * 60
    ) {
      out.push({
        id: `remind:${ev.id}`,
        kind: "reminder",
        event_id: ev.id,
        event_title: ev.title,
        event_start: ev.start,
        reason:
          minsToStart < 60
            ? `Starts in ${minsToStart} min — flag the reminder bell.`
            : `Starts in ${Math.round(minsToStart / 60)}h — make sure reminders are on.`,
      });
    }
  }

  // Order: earliest event first, then by action priority (attend → notes → remind)
  const KIND_ORDER: Record<ActionKind, number> = {
    attend: 0,
    note_taker: 1,
    reminder: 2,
  };
  out.sort((a, b) => {
    const dt = a.event_start.getTime() - b.event_start.getTime();
    if (dt !== 0) return dt;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
  return out;
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[#F87171]",
  medium: "bg-[#FACC15]",
  low: "bg-white/40",
  done: "bg-[#4ADE80]",
};

const PRIORITY_CHIP: Record<string, string> = {
  high: "bg-[rgba(220,38,38,0.14)] text-[#F87171] border-[rgba(220,38,38,0.40)]",
  medium: "bg-[rgba(234,179,8,0.14)] text-[#FACC15] border-[rgba(234,179,8,0.40)]",
  low: "bg-white/[0.04] text-parchment border-white/[0.08]",
  done: "bg-[rgba(34,197,94,0.14)] text-[#4ADE80] border-[rgba(34,197,94,0.40)]",
};

const REMINDER_MINUTES = [30, 15, 5] as const;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startOffset = first.getDay();
  const gridStart = addDays(first, -startOffset);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function weekGrid(anchor: Date): Date[] {
  const start = addDays(startOfDay(anchor), -anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDay(d: Date) {
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function CalendarPage() {
  const { agent: myAgent } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [view, setView] = useState<ViewMode>("agenda");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [source, setSource] = useState<CalendarSource>("google");
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [birthdays, setBirthdays] = useState<BirthdayContact[]>([]);

  useEffect(() => {
    Promise.all([
      // Real Google Calendar through the workspace adapter — backend falls back
      // to seed data automatically if the user hasn't connected Google yet.
      fetchWorkspaceCalendar(myAgent?.id || "demo").catch(() => []),
      fetchPendingItems().catch(() => []),
      myAgent ? fetchMeetings(myAgent.id).catch(() => []) : Promise.resolve([]),
    ]).then(([ev, p, m]) => {
      setEvents(ev as CalendarEvent[]);
      setPending(p);
      setMeetings(m);
      setLoading(false);
    });
  }, [myAgent]);

  // Time blocks — separate fetch so signed-out users still get the rest of
  // the calendar (blocks need a session; the API call would 401 anyway).
  const refreshBlocks = async () => {
    if (!myAgent) return;
    try {
      const next = await fetchTimeBlocks();
      setBlocks(next);
    } catch {
      // Silently ignore — likely 401 in dev when not signed in.
    }
  };
  useEffect(() => {
    refreshBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAgent]);

  // Birthdays from Google Contacts — global per-user, not day-scoped.
  // Cheap to refetch; we only do it once per session anyway.
  useEffect(() => {
    if (!myAgent) {
      setBirthdays([]);
      return;
    }
    fetchBirthdays()
      .then(setBirthdays)
      .catch(() => setBirthdays([]));
  }, [myAgent]);

  useEffect(() => {
    fetchGoogleStatus(myAgent?.id)
      .then(setGoogle)
      .catch(() => setGoogle(null));
  }, [myAgent]);

  // Heartbeat for reminder checks + now-line
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Notification permission toggle
  const handleToggleNotify = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Browser notifications are not supported here.");
      return;
    }
    if (notifyEnabled) {
      setNotifyEnabled(false);
      return;
    }
    if (Notification.permission === "granted") {
      setNotifyEnabled(true);
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifyEnabled(perm === "granted");
  };

  // Reminder scheduler — fires 30/15/5 min before event start
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!notifyEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const check = () => {
      const t = Date.now();
      for (const ev of events) {
        const start = new Date(ev.start_time).getTime();
        for (const m of REMINDER_MINUTES) {
          const fireAt = start - m * 60_000;
          const key = `${ev.id}:${m}`;
          // Fire once, within a 60s window after the trigger point
          if (
            !firedRef.current.has(key) &&
            t >= fireAt &&
            t < fireAt + 60_000 &&
            start > t
          ) {
            firedRef.current.add(key);
            try {
              new Notification(`${ev.title} — in ${m} min`, {
                body: `${formatTime(new Date(ev.start_time))} · ${ev.attendees.length} attendees`,
                tag: key,
              });
            } catch {
              /* ignore */
            }
          }
        }
      }
    };

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [notifyEnabled, events]);

  // Merge events + deadlines into a single calendar item list
  const items: CalendarItem[] = useMemo(() => {
    const evs: CalendarItem[] = events.map((e) => {
      const attendees = e.attendees.length;
      return {
        kind: "event",
        id: `ev:${e.id}`,
        title: e.title,
        start: new Date(e.start_time),
        end: new Date(e.end_time),
        meeting_url: e.meeting_url,
        attendees,
        has_transcript: e.has_transcript,
        eventPriority: eventPriorityFor({
          title: e.title,
          attendees,
          meeting_url: e.meeting_url,
        }),
      };
    });

    const mtgs: CalendarItem[] = meetings
      .filter((m) => m.created_at)
      .map((m) => {
        const start = new Date(m.created_at as string);
        return {
          kind: "event",
          id: `mt:${m.id}`,
          title: m.title,
          start,
          end: new Date(start.getTime() + 30 * 60_000),
          attendees: 0,
          has_transcript: true,
          eventPriority: eventPriorityFor({
            title: m.title,
            attendees: 0,
          }),
        };
      });

    const deadlines: CalendarItem[] = pending
      .filter((p) => p.due_date)
      .map((p) => {
        const start = new Date(p.due_date as string);
        return {
          kind: "deadline",
          id: `dl:${p.id}`,
          title: p.title,
          start,
          end: start,
          priority: p.priority,
          status: p.status,
        };
      });

    const blockItems: CalendarItem[] = blocks.map((b) => ({
      kind: "block",
      id: `bl:${b.id}`,
      blockId: b.id,
      title: b.title,
      start: new Date(b.start_time),
      end: new Date(b.end_time),
      blockKind: b.kind,
      synced_to_google: b.synced_to_google,
      notes: b.notes,
    }));

    // Birthdays — generate three calendar entries per contact (this year,
    // last year, next year) so the right one shows up regardless of which
    // year the user is browsing. They're all-day at midnight local.
    const birthdayItems: CalendarItem[] = [];
    const cursorYear = cursor.getFullYear();
    const years = [cursorYear - 1, cursorYear, cursorYear + 1];
    for (const b of birthdays) {
      for (const y of years) {
        const start = new Date(y, b.month - 1, b.day, 0, 0, 0, 0);
        const end = new Date(y, b.month - 1, b.day, 23, 59, 0, 0);
        const age = b.year ? y - b.year : null;
        birthdayItems.push({
          kind: "birthday",
          id: `bd:${b.email || b.name}:${y}`,
          title: b.name,
          start,
          end,
          email: b.email,
          age,
        });
      }
    }

    return [...evs, ...mtgs, ...deadlines, ...blockItems, ...birthdayItems].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
  }, [events, meetings, pending, blocks, birthdays, cursor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const key = startOfDay(it.start).toISOString();
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  const dayItems = (d: Date): CalendarItem[] =>
    itemsByDay.get(startOfDay(d).toISOString()) ?? [];

  const nextUpcoming = items
    .filter((it) => it.kind === "event" && it.start.getTime() > now.getTime())
    .slice(0, 3);

  const upcomingReminders = nextUpcoming.map((it) => {
    const diffMin = Math.round((it.start.getTime() - now.getTime()) / 60_000);
    return { item: it, diffMin };
  });

  const cursorLabel = useMemo(() => {
    if (view === "month") {
      return cursor.toLocaleDateString([], { month: "long", year: "numeric" });
    }
    if (view === "week" || view === "list" || view === "board") {
      const wk = weekGrid(cursor);
      return `${wk[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${wk[6].toLocaleDateString([], { month: "short", day: "numeric" })}`;
    }
    // Agenda is day-scoped — show the selected day
    return selectedDay.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [view, cursor, selectedDay]);

  const handleStep = (dir: -1 | 1) => {
    if (view === "agenda") {
      // Agenda steps one day at a time (right arrow → next day, left → prev day)
      const next = addDays(selectedDay, dir);
      setSelectedDay(next);
      // Keep cursor in sync so other views pick up the new week/month
      setCursor(next);
      return;
    }
    const c = new Date(cursor);
    if (view === "month") c.setMonth(c.getMonth() + dir);
    else c.setDate(c.getDate() + dir * 7);
    setCursor(c);
  };

  const weekActionItems = useMemo(
    () => deriveActionItems(items, selectedDay, now),
    [items, selectedDay, now],
  );

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-claret" /> Calendar
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Meetings, deadlines, and reminders in one view
            </p>
            <SourcePicker
              source={source}
              onChange={setSource}
              googleConnected={!!google?.connected}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setBlockModalOpen(true)}
              disabled={!myAgent}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[rgba(96,165,250,0.30)] bg-[rgba(96,165,250,0.10)] text-[#BFDBFE] hover:bg-[rgba(96,165,250,0.18)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Time block
            </button>
            <button
              onClick={handleToggleNotify}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition ${
                notifyEnabled
                  ? "bg-[rgba(34,197,94,0.12)] text-[#4ADE80] border-[rgba(34,197,94,0.35)]"
                  : "bg-ink text-smoke border-white/[0.08] hover:text-parchment"
              }`}
              aria-pressed={notifyEnabled}
            >
              {notifyEnabled ? (
                <Bell className="w-3.5 h-3.5" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              {notifyEnabled ? "Reminders on" : "Enable reminders"}
            </button>

            <div
              role="tablist"
              aria-label="Calendar view"
              className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
            >
              {VIEW_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                    view === id
                      ? "bg-white/[0.08] text-bone"
                      : "text-smoke hover:text-parchment"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleStep(-1)}
                className="p-1.5 rounded-md hover:bg-white/[0.05] text-smoke hover:text-parchment transition"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  setCursor(today);
                  setSelectedDay(startOfDay(today));
                }}
                className="text-xs px-2.5 py-1 rounded-md hover:bg-white/[0.05] text-smoke hover:text-parchment transition"
              >
                Today
              </button>
              <button
                onClick={() => handleStep(1)}
                className="p-1.5 rounded-md hover:bg-white/[0.05] text-smoke hover:text-parchment transition"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-sm text-parchment font-medium min-w-[140px] text-right tabular-nums">
              {cursorLabel}
            </span>
          </div>
        </div>

        {/* Google connection banner — only when not connected and creds exist */}
        {google && !google.connected && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-dusk bg-ink border border-white/[0.06] rounded-md px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>
              Showing demo data. Connect Google Calendar in{" "}
              <Link href="/settings" className="text-claret hover:text-[#D6596C]">
                Settings
              </Link>{" "}
              to sync your real calendar.
            </span>
          </div>
        )}
        {google?.connected && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-[#88D3A4]">
            <CheckCircle2 className="w-3 h-3" />
            Synced live with Google Calendar.
          </div>
        )}

        {/* Reminder strip */}
        {upcomingReminders.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-dusk uppercase tracking-wide">
              Up next
            </span>
            {upcomingReminders.map(({ item, diffMin }) => {
              const soon = diffMin <= 30;
              return (
                <span
                  key={item.id}
                  className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border ${
                    soon
                      ? "bg-[rgba(220,38,38,0.14)] text-[#F87171] border-[rgba(220,38,38,0.40)]"
                      : "bg-ink text-smoke border-white/[0.08]"
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span className="truncate max-w-[220px]">{item.title}</span>
                  <span className="opacity-80">
                    {diffMin < 60
                      ? `in ${diffMin}m`
                      : `at ${formatTime(item.start)}`}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      ) : view === "agenda" ? (
        <AgendaView
          day={selectedDay}
          items={dayItems(selectedDay)}
          actionItems={weekActionItems}
          now={now}
        />
      ) : view === "list" ? (
        <ListView cursor={cursor} dayItems={dayItems} now={now} />
      ) : view === "board" ? (
        <BoardView cursor={cursor} dayItems={dayItems} now={now} />
      ) : view === "week" ? (
        <WeekView
          cursor={cursor}
          dayItems={dayItems}
          now={now}
          onPickDay={setSelectedDay}
          selectedDay={selectedDay}
        />
      ) : (
        <MonthView
          cursor={cursor}
          dayItems={dayItems}
          now={now}
          onPickDay={setSelectedDay}
          selectedDay={selectedDay}
        />
      )}

      {view !== "agenda" && view !== "list" && view !== "board" && (
        <DayDetailPanel day={selectedDay} items={dayItems(selectedDay)} />
      )}

      {blockModalOpen && (
        <TimeBlockModal
          initialDay={selectedDay}
          googleConnected={!!google?.connected}
          onClose={() => setBlockModalOpen(false)}
          onCreated={async () => {
            setBlockModalOpen(false);
            await refreshBlocks();
          }}
          onDelete={async (blockId) => {
            try {
              await deleteTimeBlock(blockId);
              await refreshBlocks();
            } catch {
              /* swallow — surfacing via console is enough for now */
            }
          }}
          existing={blocks}
        />
      )}
    </div>
  );
}

function MonthView({
  cursor,
  dayItems,
  now,
  onPickDay,
  selectedDay,
}: {
  cursor: Date;
  dayItems: (d: Date) => CalendarItem[];
  now: Date;
  onPickDay: (d: Date) => void;
  selectedDay: Date;
}) {
  const grid = monthGrid(cursor);
  const monthIdx = cursor.getMonth();

  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-px bg-white/[0.06] border border-white/[0.06] rounded-xl overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-obsidian px-3 py-2 text-[11px] font-medium text-smoke"
          >
            {d}
          </div>
        ))}
        {grid.map((d) => {
          const its = dayItems(d);
          const inMonth = d.getMonth() === monthIdx;
          const today = sameDay(d, now);
          const selected = sameDay(d, selectedDay);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPickDay(d)}
              className={`bg-obsidian text-left min-h-[110px] p-2 flex flex-col gap-1 transition hover:bg-white/[0.02] ${
                selected ? "ring-1 ring-claret ring-inset" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs tabular-nums ${
                    today
                      ? "bg-oxblood text-bone rounded-full w-5 h-5 inline-flex items-center justify-center font-semibold"
                      : inMonth
                        ? "text-parchment"
                        : "text-dusk"
                  }`}
                >
                  {d.getDate()}
                </span>
                {its.length > 3 && (
                  <span className="text-[9px] text-dusk">+{its.length - 3}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {its.slice(0, 3).map((it) => (
                  <CellChip key={it.id} item={it} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  cursor,
  dayItems,
  now,
  onPickDay,
  selectedDay,
}: {
  cursor: Date;
  dayItems: (d: Date) => CalendarItem[];
  now: Date;
  onPickDay: (d: Date) => void;
  selectedDay: Date;
}) {
  const days = weekGrid(cursor);
  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const its = dayItems(d);
          const today = sameDay(d, now);
          const selected = sameDay(d, selectedDay);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPickDay(d)}
              className={`bg-ink border rounded-xl p-3 min-h-[240px] text-left transition card-lift ${
                selected
                  ? "border-claret"
                  : today
                    ? "border-oxblood/60"
                    : "border-white/[0.06] hover:border-white/[0.12]"
              }`}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-dusk">
                  {d.toLocaleDateString([], { weekday: "short" })}
                </span>
                <span
                  className={`text-base tabular-nums ${
                    today ? "text-claret font-semibold" : "text-parchment"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {its.map((it) => (
                  <CellChip key={it.id} item={it} expanded />
                ))}
                {its.length === 0 && (
                  <span className="text-[10px] text-dusk">—</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({
  day,
  items,
  actionItems,
  now,
}: {
  day: Date;
  items: CalendarItem[];
  actionItems: ActionItem[];
  now: Date;
}) {
  const eventsOnly = items.filter(
    (i): i is Extract<CalendarItem, { kind: "event" }> => i.kind === "event",
  );
  const blocksOnly = items.filter(
    (i): i is Extract<CalendarItem, { kind: "block" }> => i.kind === "block",
  );
  const birthdaysOnly = items.filter(
    (i): i is Extract<CalendarItem, { kind: "birthday" }> => i.kind === "birthday",
  );
  const high = eventsOnly.filter((e) => e.eventPriority === "high");
  const low = eventsOnly.filter((e) => e.eventPriority === "low");

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl">
        {/* Column 1 — Meetings, grouped by priority */}
        <section>
          <h2 className="text-sm font-medium text-parchment mb-3 flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5 text-claret" />
            Meetings
            <span className="text-[10px] font-mono text-dusk">
              {eventsOnly.length}
            </span>
          </h2>

          <h3 className="text-[10px] uppercase tracking-wider text-dusk mt-3 mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F87171]" />
            High priority
            <span className="font-mono">{high.length}</span>
          </h3>
          {high.length === 0 ? (
            <EmptyCard label="No high-priority meetings on this day." />
          ) : (
            <div className="space-y-2">
              {high.map((e) => (
                <MeetingRow key={e.id} ev={e} now={now} />
              ))}
            </div>
          )}

          <h3 className="text-[10px] uppercase tracking-wider text-dusk mt-5 mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            Low priority
            <span className="font-mono">{low.length}</span>
          </h3>
          {low.length === 0 ? (
            <EmptyCard label="No low-priority meetings." />
          ) : (
            <div className="space-y-2">
              {low.map((e) => (
                <MeetingRow key={e.id} ev={e} now={now} muted />
              ))}
            </div>
          )}

          <h3 className="text-[10px] uppercase tracking-wider text-dusk mt-5 mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]" />
            Focus blocks
            <span className="font-mono">{blocksOnly.length}</span>
          </h3>
          {blocksOnly.length === 0 ? (
            <EmptyCard label="No time blocks scheduled — add one with the Time block button." />
          ) : (
            <div className="space-y-2">
              {blocksOnly.map((b) => (
                <BlockRow key={b.id} block={b} now={now} />
              ))}
            </div>
          )}

          {birthdaysOnly.length > 0 && (
            <>
              <h3 className="text-[10px] uppercase tracking-wider text-dusk mt-5 mb-2 flex items-center gap-1.5">
                <Cake className="w-3 h-3 text-[#F9A8D4]" />
                Birthdays
                <span className="font-mono">{birthdaysOnly.length}</span>
              </h3>
              <div className="space-y-1.5">
                {birthdaysOnly.map((b) => (
                  <div
                    key={b.id}
                    className="bg-ink border border-white/[0.06] rounded-md px-2.5 py-1.5 text-[12px] flex items-center gap-2"
                  >
                    <Cake className="w-3 h-3 text-[#F9A8D4] shrink-0" />
                    <span className="text-parchment truncate flex-1">
                      {b.title}
                    </span>
                    {b.age !== null && (
                      <span className="text-dusk text-[10px]">
                        turns {b.age}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Column 2 — Action items derived from the next 3 days */}
        <section>
          <h2 className="text-sm font-medium text-parchment mb-3 flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5 text-claret" />
            Action items
            <span className="text-[10px] font-mono text-dusk">
              {actionItems.length}
            </span>
          </h2>
          <p className="text-[11px] text-dusk mb-3">
            What your agent recommends for {day.toLocaleDateString([], { weekday: "long" })}
            {" and the next two days."}
          </p>
          {actionItems.length === 0 ? (
            <EmptyCard label="Nothing to flag — your day is calm." />
          ) : (
            <div className="space-y-2">
              {actionItems.map((a) => (
                <ActionRow key={a.id} action={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MeetingRow({
  ev,
  now,
  muted,
}: {
  ev: Extract<CalendarItem, { kind: "event" }>;
  now: Date;
  muted?: boolean;
}) {
  const minsToStart = Math.round((ev.start.getTime() - now.getTime()) / 60_000);
  const past = ev.end.getTime() < now.getTime();
  return (
    <div
      className={`flex items-start gap-3 bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5 ${
        muted || past ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col items-center justify-center bg-graphite rounded-md px-2 py-1.5 shrink-0 border border-white/[0.06] min-w-[54px]">
        <span className="text-[9px] uppercase tracking-wide text-dusk">
          {formatTime(ev.start)}
        </span>
        <span className="text-[10px] text-dusk leading-none">
          {formatTime(ev.end)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-bone truncate">{ev.title}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded border bg-[rgba(139,30,47,0.18)] text-[#F0B8C0] border-[rgba(139,30,47,0.35)]">
            {ev.eventPriority}
          </span>
        </div>
        <div className="text-[11px] text-dusk mt-0.5">
          {ev.attendees > 0
            ? `${ev.attendees} ${ev.attendees === 1 ? "attendee" : "attendees"}`
            : "Solo block"}
          {!past && minsToStart > 0 && minsToStart < 240
            ? ` · in ${minsToStart < 60 ? `${minsToStart}m` : `${Math.round(minsToStart / 60)}h`}`
            : ""}
        </div>
      </div>
      {ev.meeting_url && !past && (
        <a
          href={ev.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-claret hover:text-[#D6596C] transition shrink-0"
        >
          <Video className="w-3 h-3" /> Join
        </a>
      )}
    </div>
  );
}

const ACTION_ICON: Record<ActionKind, typeof CheckSquare> = {
  attend: CheckSquare,
  note_taker: PenLine,
  reminder: BellRing,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  attend: "Attend",
  note_taker: "Run note-taker",
  reminder: "Set reminder",
};

const ACTION_TINT: Record<ActionKind, string> = {
  attend:
    "bg-[rgba(220,38,38,0.10)] text-[#F87171] border-[rgba(220,38,38,0.32)]",
  note_taker:
    "bg-[rgba(139,30,47,0.18)] text-[#F0B8C0] border-[rgba(139,30,47,0.35)]",
  reminder:
    "bg-[rgba(234,179,8,0.12)] text-[#FACC15] border-[rgba(234,179,8,0.36)]",
};

function BlockRow({
  block,
  now,
}: {
  block: Extract<CalendarItem, { kind: "block" }>;
  now: Date;
}) {
  const past = block.end.getTime() < now.getTime();
  const active =
    block.start.getTime() <= now.getTime() && block.end.getTime() > now.getTime();
  const durationMin = Math.max(
    1,
    Math.round((block.end.getTime() - block.start.getTime()) / 60_000),
  );
  return (
    <div
      className={`bg-ink border rounded-lg px-3 py-2.5 ${
        active
          ? "border-[rgba(96,165,250,0.55)]"
          : "border-white/[0.06]"
      } ${past ? "opacity-55" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-[rgba(96,165,250,0.35)] bg-[rgba(96,165,250,0.10)] text-[#BFDBFE]">
          <Focus className="w-3 h-3" />
          {BLOCK_KIND_LABEL[block.blockKind]}
        </span>
        <span className="text-sm text-parchment truncate">{block.title}</span>
        {!block.synced_to_google && (
          <span
            className="text-[9px] text-dusk"
            title="Not synced to Google Calendar — connect Google with calendar.events scope to mirror this block."
          >
            local only
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-dusk">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(block.start)} – {formatTime(block.end)}
        </span>
        <span>{durationMin} min</span>
        {active && <span className="text-[#60A5FA]">now</span>}
      </div>
      {block.notes && (
        <p className="mt-1 text-[11px] text-smoke line-clamp-2">{block.notes}</p>
      )}
    </div>
  );
}

function TimeBlockModal({
  initialDay,
  googleConnected,
  existing,
  onClose,
  onCreated,
  onDelete,
}: {
  initialDay: Date;
  googleConnected: boolean;
  existing: TimeBlock[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onDelete: (blockId: string) => Promise<void> | void;
}) {
  // Seed default times: next half-hour boundary on the selected day, 60 min long.
  const seed = useMemo(() => {
    const base = new Date(initialDay);
    const now = new Date();
    if (sameDay(base, now)) {
      base.setHours(now.getHours());
      base.setMinutes(now.getMinutes() < 30 ? 30 : 0);
      if (now.getMinutes() >= 30) base.setHours(now.getHours() + 1);
    } else {
      base.setHours(9);
      base.setMinutes(0);
    }
    base.setSeconds(0);
    base.setMilliseconds(0);
    const start = base;
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);
    return { start, end };
  }, [initialDay]);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TimeBlockKind>("focus");
  const [date, setDate] = useState(toDateInput(seed.start));
  const [startTime, setStartTime] = useState(toTimeInput(seed.start));
  const [endTime, setEndTime] = useState(toTimeInput(seed.end));
  const [notes, setNotes] = useState("");
  const [syncToGoogle, setSyncToGoogle] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayBlocks = useMemo(
    () =>
      existing
        .filter((b) => sameDay(new Date(b.start_time), initialDay))
        .sort(
          (a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        ),
    [existing, initialDay],
  );

  const handleSubmit = async () => {
    setError(null);
    const startISO = combineDateTime(date, startTime).toISOString();
    const endISO = combineDateTime(date, endTime).toISOString();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      setError("End must be after start.");
      return;
    }
    setSubmitting(true);
    try {
      await createTimeBlock({
        title: title.trim(),
        start_time: startISO,
        end_time: endISO,
        kind,
        notes: notes.trim() || null,
        sync_to_google: syncToGoogle,
      });
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the block.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-obsidian border border-white/[0.08] rounded-xl max-w-md w-[92vw] p-5 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-bone flex items-center gap-2">
              <Focus className="w-4 h-4 text-[#60A5FA]" />
              New time block
            </h2>
            <p className="text-[11px] text-dusk mt-0.5">
              {initialDay.toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/[0.05] text-smoke hover:text-parchment transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] text-dusk uppercase tracking-wider">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deep work on V1 onboarding"
              className="mt-1 w-full bg-ink border border-white/[0.08] rounded-md px-3 py-2 text-sm text-parchment placeholder:text-dusk focus:outline-none focus:border-[rgba(96,165,250,0.55)]"
              autoFocus
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[11px] text-dusk uppercase tracking-wider">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full bg-ink border border-white/[0.08] rounded-md px-2 py-2 text-sm text-parchment focus:outline-none focus:border-[rgba(96,165,250,0.55)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-dusk uppercase tracking-wider">
                Start
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full bg-ink border border-white/[0.08] rounded-md px-2 py-2 text-sm text-parchment focus:outline-none focus:border-[rgba(96,165,250,0.55)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-dusk uppercase tracking-wider">
                End
              </span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full bg-ink border border-white/[0.08] rounded-md px-2 py-2 text-sm text-parchment focus:outline-none focus:border-[rgba(96,165,250,0.55)]"
              />
            </label>
          </div>

          <div>
            <span className="text-[11px] text-dusk uppercase tracking-wider">
              Type
            </span>
            <div className="mt-1 flex gap-1">
              {(Object.keys(BLOCK_KIND_LABEL) as TimeBlockKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`text-[11px] px-2.5 py-1 rounded border transition ${
                    kind === k
                      ? "bg-[rgba(96,165,250,0.18)] text-[#BFDBFE] border-[rgba(96,165,250,0.45)]"
                      : "bg-ink text-smoke border-white/[0.08] hover:text-parchment"
                  }`}
                >
                  {BLOCK_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-[11px] text-dusk uppercase tracking-wider">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — what you're protecting this time for."
              rows={2}
              className="mt-1 w-full bg-ink border border-white/[0.08] rounded-md px-3 py-2 text-sm text-parchment placeholder:text-dusk focus:outline-none focus:border-[rgba(96,165,250,0.55)] resize-none"
            />
          </label>

          <label className="flex items-center gap-2 text-[11px] text-smoke">
            <input
              type="checkbox"
              checked={syncToGoogle}
              onChange={(e) => setSyncToGoogle(e.target.checked)}
              className="accent-[#60A5FA]"
            />
            <span>
              Mirror to Google Calendar
              {!googleConnected && (
                <span className="text-dusk">
                  {" "}
                  — connect Google to enable
                </span>
              )}
            </span>
          </label>

          {error && (
            <div className="text-[11px] text-[#F87171] bg-[rgba(220,38,38,0.10)] border border-[rgba(220,38,38,0.30)] rounded px-2.5 py-1.5">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-3 py-2 text-sm rounded-md bg-[rgba(96,165,250,0.18)] text-[#BFDBFE] border border-[rgba(96,165,250,0.45)] hover:bg-[rgba(96,165,250,0.26)] transition disabled:opacity-50 disabled:cursor-wait"
            >
              {submitting ? "Saving…" : "Create block"}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-md border border-white/[0.08] text-smoke hover:text-parchment hover:bg-white/[0.04] transition"
            >
              Cancel
            </button>
          </div>
        </div>

        {todayBlocks.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <div className="text-[11px] text-dusk uppercase tracking-wider mb-2">
              Today's blocks
            </div>
            <div className="space-y-1.5">
              {todayBlocks.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 text-[12px] bg-ink border border-white/[0.05] rounded px-2.5 py-1.5"
                >
                  <span className="text-[#BFDBFE] text-[10px]">
                    {BLOCK_KIND_LABEL[b.kind]}
                  </span>
                  <span className="text-parchment flex-1 truncate">
                    {b.title}
                  </span>
                  <span className="text-dusk text-[10px] tabular-nums">
                    {formatTime(new Date(b.start_time))}–
                    {formatTime(new Date(b.end_time))}
                  </span>
                  <button
                    onClick={() => onDelete(b.id)}
                    className="p-0.5 text-dusk hover:text-[#F87171] transition"
                    aria-label="Delete block"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toDateInput(d: Date): string {
  // YYYY-MM-DD in local time — the <input type="date"> expects local
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mm] = timeStr.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, mm ?? 0, 0, 0);
}

function ActionRow({ action }: { action: ActionItem }) {
  const Icon = ACTION_ICON[action.kind];
  return (
    <div className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${ACTION_TINT[action.kind]}`}
        >
          <Icon className="w-3 h-3" />
          {ACTION_LABEL[action.kind]}
        </span>
        <span className="text-[10px] font-mono text-dusk">
          {action.event_start.toLocaleDateString([], {
            weekday: "short",
          })}{" "}
          · {formatTime(action.event_start)}
        </span>
      </div>
      <div className="text-sm text-bone truncate mt-1.5">
        {action.event_title}
      </div>
      <div className="text-[11px] text-smoke mt-0.5">{action.reason}</div>
    </div>
  );
}

function CellChip({ item, expanded }: { item: CalendarItem; expanded?: boolean }) {
  if (item.kind === "event") {
    return (
      <span
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[rgba(139,30,47,0.18)] text-[#F0B8C0] border border-[rgba(139,30,47,0.35)] truncate"
        title={item.title}
      >
        <span className="w-1 h-1 rounded-full bg-[#F0B8C0] shrink-0" />
        <span className="truncate">
          {expanded ? `${formatTime(item.start)} · ${item.title}` : item.title}
        </span>
      </span>
    );
  }
  if (item.kind === "block") {
    return (
      <span
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[rgba(96,165,250,0.14)] text-[#BFDBFE] border border-[rgba(96,165,250,0.35)] truncate"
        title={`${BLOCK_KIND_LABEL[item.blockKind]} · ${item.title}`}
      >
        <Focus className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">
          {expanded ? `${formatTime(item.start)} · ${item.title}` : item.title}
        </span>
      </span>
    );
  }
  if (item.kind === "birthday") {
    return (
      <span
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[rgba(244,114,182,0.14)] text-[#F9A8D4] border border-[rgba(244,114,182,0.35)] truncate"
        title={`Birthday — ${item.title}`}
      >
        <Cake className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">{item.title}</span>
      </span>
    );
  }
  const key = item.status === "done" ? "done" : item.priority;
  return (
    <span
      className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border truncate ${PRIORITY_CHIP[key]}`}
      title={item.title}
    >
      <Flag className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate">{item.title}</span>
    </span>
  );
}

function DayDetailPanel({
  day,
  items,
}: {
  day: Date;
  items: CalendarItem[];
}) {
  const events = items.filter((i) => i.kind === "event");
  const deadlines = items.filter((i) => i.kind === "deadline");

  return (
    <aside className="border-t border-white/[0.06] bg-ink/40 px-6 py-5">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-4 h-4 text-claret" />
        <h2 className="text-sm font-medium text-parchment">{formatDay(day)}</h2>
        <span className="text-[11px] text-dusk">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h3 className="text-[11px] uppercase tracking-wide text-dusk mb-2">
            Meetings
          </h3>
          {events.length === 0 ? (
            <p className="text-xs text-dusk">No meetings today.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-smoke" />
                    <span className="text-xs text-bone truncate">{e.title}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-dusk">
                      {formatTime(e.start)}
                      {e.kind === "event" ? ` – ${formatTime(e.end)}` : ""}
                    </span>
                    {e.kind === "event" && e.meeting_url && (
                      <a
                        href={e.meeting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-claret hover:text-[#D6596C] flex items-center gap-1"
                      >
                        <Video className="w-3 h-3" /> Join
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[11px] uppercase tracking-wide text-dusk mb-2">
            Deadlines
          </h3>
          {deadlines.length === 0 ? (
            <p className="text-xs text-dusk">No deadlines today.</p>
          ) : (
            <div className="space-y-2">
              {deadlines.map((d) =>
                d.kind === "deadline" ? (
                  <div
                    key={d.id}
                    className="bg-ink border border-white/[0.06] rounded-lg px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      {d.status === "done" ? (
                        <CheckCircle2 className="w-3 h-3 text-[#4ADE80]" />
                      ) : (
                        <AlertCircle
                          className={`w-3 h-3 ${
                            d.priority === "high"
                              ? "text-[#F87171]"
                              : d.priority === "medium"
                                ? "text-[#FACC15]"
                                : "text-smoke"
                          }`}
                        />
                      )}
                      <span className="text-xs text-bone truncate">{d.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          PRIORITY_DOT[d.status === "done" ? "done" : d.priority]
                        }`}
                      />
                      <span className="text-[11px] text-dusk">
                        {d.status === "done" ? "Done" : `${d.priority} priority`}
                      </span>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </section>
      </div>

      <p className="text-[11px] text-dusk mt-5 flex items-center gap-1.5">
        <Bell className="w-3 h-3" />
        Reminders fire {REMINDER_MINUTES.join(" / ")} minutes before each
        meeting. Enable them from the header. Connect Google from settings to
        pull live calendar events; otherwise we show seed data + your imported
        transcripts.{" "}
        <Link href="/meetings/new" className="text-claret hover:text-[#D6596C] ml-1">
          Import a transcript
        </Link>
      </p>
    </aside>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="bg-ink border border-white/[0.06] rounded-xl p-6 text-center">
      <p className="text-xs text-smoke">{label}</p>
    </div>
  );
}

function SourcePicker({
  source,
  onChange,
  googleConnected,
}: {
  source: CalendarSource;
  onChange: (s: CalendarSource) => void;
  googleConnected: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 mt-2">
      <button
        type="button"
        onClick={() => onChange("google")}
        className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border transition ${
          source === "google"
            ? "bg-ink border-white/[0.14] text-bone"
            : "bg-transparent border-white/[0.06] text-smoke hover:text-parchment"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            googleConnected ? "bg-[#4ADE80]" : "bg-[#FACC15]"
          }`}
        />
        Google Calendar
      </button>
      <button
        type="button"
        disabled
        title="Microsoft Teams calendar — coming soon"
        className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-white/[0.06] bg-transparent text-dusk cursor-not-allowed"
      >
        Microsoft Teams
        <span className="text-[9px] uppercase tracking-wider text-dusk font-mono">
          soon
        </span>
      </button>
    </div>
  );
}

function ListView({
  cursor,
  dayItems,
  now,
}: {
  cursor: Date;
  dayItems: (d: Date) => CalendarItem[];
  now: Date;
}) {
  const days = weekGrid(cursor);
  return (
    <div className="p-6 max-w-3xl space-y-4">
      {days.map((d) => {
        const its = dayItems(d);
        const isToday = sameDay(d, now);
        return (
          <section key={d.toISOString()} className="animate-fade-up">
            <header className="flex items-baseline gap-2 mb-2">
              <h3
                className={`text-sm font-medium ${
                  isToday ? "text-claret" : "text-parchment"
                }`}
              >
                {d.toLocaleDateString([], {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
                {isToday && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-claret/80">
                    Today
                  </span>
                )}
              </h3>
              <span className="text-[10px] font-mono text-dusk">
                {its.length} {its.length === 1 ? "item" : "items"}
              </span>
            </header>
            {its.length === 0 ? (
              <p className="text-[11px] text-dusk pl-3 border-l border-white/[0.06]">
                Nothing scheduled.
              </p>
            ) : (
              <ul className="space-y-1.5 border-l border-white/[0.06] pl-3">
                {its.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-start gap-2 text-[12px]"
                  >
                    <span className="text-[10px] font-mono text-dusk w-12 shrink-0 mt-0.5">
                      {formatTime(it.start)}
                    </span>
                    <span className="flex-1 text-parchment truncate">
                      {it.title}
                    </span>
                    {it.kind === "event" && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                          it.eventPriority === "high"
                            ? "bg-[rgba(220,38,38,0.10)] text-[#F87171] border-[rgba(220,38,38,0.32)]"
                            : "bg-white/[0.04] text-dusk border-white/[0.08]"
                        }`}
                      >
                        {it.eventPriority}
                      </span>
                    )}
                    {it.kind === "deadline" && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                          PRIORITY_CHIP[
                            it.status === "done" ? "done" : it.priority
                          ]
                        }`}
                      >
                        <Flag className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
                        {it.status === "done" ? "done" : it.priority}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BoardView({
  cursor,
  dayItems,
  now,
}: {
  cursor: Date;
  dayItems: (d: Date) => CalendarItem[];
  now: Date;
}) {
  const days = weekGrid(cursor);
  return (
    <div className="p-6 overflow-x-auto">
      <div className="flex gap-3 min-w-max">
        {days.map((d) => {
          const its = dayItems(d);
          const isToday = sameDay(d, now);
          return (
            <div
              key={d.toISOString()}
              className={`w-[260px] shrink-0 bg-ink border rounded-xl p-3 ${
                isToday ? "border-claret/60" : "border-white/[0.06]"
              }`}
            >
              <div className="flex items-baseline justify-between mb-3">
                <span
                  className={`text-[11px] uppercase tracking-wider ${
                    isToday ? "text-claret" : "text-dusk"
                  }`}
                >
                  {d.toLocaleDateString([], { weekday: "short" })}
                </span>
                <span
                  className={`text-base tabular-nums ${
                    isToday ? "text-claret font-semibold" : "text-parchment"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              {its.length === 0 ? (
                <p className="text-[11px] text-dusk text-center py-6">
                  Empty
                </p>
              ) : (
                <ul className="space-y-2">
                  {its.map((it) => (
                    <li
                      key={it.id}
                      className="bg-graphite border border-white/[0.06] rounded-md px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-mono text-dusk">
                          {formatTime(it.start)}
                        </span>
                        {it.kind === "event" ? (
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                              it.eventPriority === "high"
                                ? "bg-[rgba(220,38,38,0.10)] text-[#F87171] border-[rgba(220,38,38,0.32)]"
                                : "bg-white/[0.04] text-dusk border-white/[0.08]"
                            }`}
                          >
                            {it.eventPriority}
                          </span>
                        ) : it.kind === "block" ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded border shrink-0 bg-[rgba(96,165,250,0.10)] text-[#BFDBFE] border-[rgba(96,165,250,0.35)]">
                            {BLOCK_KIND_LABEL[it.blockKind]}
                          </span>
                        ) : it.kind === "birthday" ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded border shrink-0 bg-[rgba(244,114,182,0.10)] text-[#F9A8D4] border-[rgba(244,114,182,0.35)]">
                            birthday
                          </span>
                        ) : (
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                              PRIORITY_CHIP[
                                it.status === "done" ? "done" : it.priority
                              ]
                            }`}
                          >
                            {it.status === "done" ? "done" : it.priority}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-parchment line-clamp-2">
                        {it.title}
                      </div>
                      {it.kind === "event" && it.meeting_url && (
                        <a
                          href={it.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-claret hover:text-[#D6596C]"
                        >
                          <Video className="w-3 h-3" /> Join
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
