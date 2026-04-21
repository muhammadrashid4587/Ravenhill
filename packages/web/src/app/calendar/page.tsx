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
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { fetchMeetings, type Meeting } from "@/lib/api";
import { fetchCalendarEvents, fetchPendingItems } from "@/lib/mocks";
import type { CalendarEvent, PendingItem } from "@/lib/types";

type ViewMode = "month" | "week" | "agenda";

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
    }
  | {
      kind: "deadline";
      id: string;
      title: string;
      start: Date;
      end: Date;
      priority: "high" | "medium" | "low";
      status: "todo" | "in_progress" | "done";
    };

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
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const [notifyEnabled, setNotifyEnabled] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchCalendarEvents(myAgent?.id).catch(() => []),
      fetchPendingItems().catch(() => []),
      myAgent ? fetchMeetings(myAgent.id).catch(() => []) : Promise.resolve([]),
    ]).then(([ev, p, m]) => {
      setEvents(ev);
      setPending(p);
      setMeetings(m);
      setLoading(false);
    });
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
    const evs: CalendarItem[] = events.map((e) => ({
      kind: "event",
      id: `ev:${e.id}`,
      title: e.title,
      start: new Date(e.start_time),
      end: new Date(e.end_time),
      meeting_url: e.meeting_url,
      attendees: e.attendees.length,
      has_transcript: e.has_transcript,
    }));

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

    return [...evs, ...mtgs, ...deadlines].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
  }, [events, meetings, pending]);

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

  const cursorLabel =
    view === "month"
      ? cursor.toLocaleDateString([], { month: "long", year: "numeric" })
      : view === "week"
        ? (() => {
            const wk = weekGrid(cursor);
            return `${wk[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${wk[6].toLocaleDateString([], { month: "short", day: "numeric" })}`;
          })()
        : "Agenda";

  const handleStep = (dir: -1 | 1) => {
    const c = new Date(cursor);
    if (view === "month") c.setMonth(c.getMonth() + dir);
    else if (view === "week") c.setDate(c.getDate() + dir * 7);
    else c.setDate(c.getDate() + dir * 14);
    setCursor(c);
  };

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
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
              {(["month", "week", "agenda"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition capitalize ${
                    view === v
                      ? "bg-white/[0.08] text-bone"
                      : "text-smoke hover:text-parchment"
                  }`}
                >
                  {v}
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
        <AgendaView items={items} now={now} />
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

      {view !== "agenda" && (
        <DayDetailPanel day={selectedDay} items={dayItems(selectedDay)} />
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
  items,
  now,
}: {
  items: CalendarItem[];
  now: Date;
}) {
  const upcoming = items.filter((i) => i.end.getTime() >= now.getTime());
  const past = items.filter((i) => i.end.getTime() < now.getTime()).reverse();
  return (
    <div className="p-6 max-w-3xl space-y-8">
      <section>
        <h2 className="text-sm font-medium text-parchment mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyCard label="Nothing upcoming" />
        ) : (
          <div className="space-y-2">
            {upcoming.map((it) => (
              <AgendaRow key={it.id} item={it} />
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-sm font-medium text-parchment mb-3">Past</h2>
        {past.length === 0 ? (
          <EmptyCard label="No history in range" />
        ) : (
          <div className="space-y-2">
            {past.slice(0, 20).map((it) => (
              <AgendaRow key={it.id} item={it} muted />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AgendaRow({ item, muted }: { item: CalendarItem; muted?: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 bg-ink border border-white/[0.06] rounded-lg px-4 py-3 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col items-center justify-center bg-graphite rounded-md px-2 py-1.5 shrink-0 border border-white/[0.06] min-w-[48px]">
        <span className="text-[9px] uppercase tracking-wide text-dusk">
          {item.start.toLocaleDateString([], { month: "short" })}
        </span>
        <span className="text-sm font-semibold text-bone leading-none">
          {item.start.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-bone truncate">{item.title}</span>
          <KindChip item={item} />
        </div>
        <div className="text-[11px] text-dusk mt-0.5">
          {formatDay(item.start)} · {formatTime(item.start)}
          {item.kind === "event" && ` – ${formatTime(item.end)}`}
          {item.kind === "event" && item.attendees > 0 && ` · ${item.attendees} attendees`}
        </div>
      </div>
      {item.kind === "event" && item.meeting_url && (
        <a
          href={item.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-smoke hover:text-parchment transition shrink-0"
        >
          <Video className="w-3 h-3" /> Join
        </a>
      )}
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

function KindChip({ item }: { item: CalendarItem }) {
  if (item.kind === "event") {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-[rgba(139,30,47,0.18)] text-[#F0B8C0] border-[rgba(139,30,47,0.35)]">
        meeting
      </span>
    );
  }
  const key = item.status === "done" ? "done" : item.priority;
  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded border ${PRIORITY_CHIP[key]}`}
    >
      {item.status === "done" ? "done" : `${item.priority} deadline`}
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
