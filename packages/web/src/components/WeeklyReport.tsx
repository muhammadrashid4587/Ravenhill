"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { fetchWeeklyReport, type WeeklyReport } from "@/lib/api";

// The dot graph rows, in display order. Each row aggregates a small
// family of related event_types so the chart stays readable.
const ROWS: Array<{
  label: string;
  types: string[];
}> = [
  { label: "Calendar", types: ["meeting_clicked", "meeting_attended", "calendar_event_viewed"] },
  { label: "Tasks completed", types: ["task_completed"] },
  { label: "Tasks created", types: ["task_created"] },
  { label: "Chat replies", types: ["chat_replied", "chat_thread_opened"] },
  { label: "Documents", types: ["document_opened", "document_shared"] },
  { label: "Inbox", types: ["inbox_item_opened"] },
];


function intensity(n: number): string {
  // 0 → faint; 1 → light; 2-3 → medium; 4+ → strong. Uses CSS vars so
  // the dot graph adapts to dark/light theme automatically.
  if (n === 0) return "bg-[color:var(--surface-overlay)]";
  if (n === 1) return "bg-oxblood/30";
  if (n <= 3) return "bg-oxblood/60";
  return "bg-oxblood";
}


function shortDate(iso: string): string {
  // "2026-04-30" → "Thu 30"
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${day} ${d.getUTCDate()}`;
}


/**
 * Weekly Report module — surfaced above the destination cards on
 * /home. Pulls the last 7 days of behavior events from
 * /api/behavior/weekly-report. Privacy bar: counts only — never
 * captures message bodies, email content, or file names.
 *
 * Two-column layout: left = dot graph (7 days × N event categories),
 * right = written summary that always begins "This is your weekly
 * report." The summary is generated server-side from the same
 * aggregates the chart renders, so they can never disagree.
 */
export default function WeeklyReportModule() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWeeklyReport()
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((e) => setError((e as Error)?.message || "Couldn't load report"))
      .finally(() => setLoading(false));
  }, []);

  // Per-row counts across the week — what the dot graph reads.
  const rowsWithCounts = useMemo(() => {
    if (!report) return [] as Array<{ label: string; counts: number[] }>;
    return ROWS.map((row) => ({
      label: row.label,
      counts: report.days.map((day) =>
        row.types.reduce((acc, t) => acc + (day.counts[t] || 0), 0),
      ),
    }));
  }, [report]);

  if (loading) {
    return (
      <div className="bg-ink border border-[color:var(--border)] rounded-2xl p-5 flex items-center gap-2 text-[12px] text-smoke">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading weekly report…
      </div>
    );
  }
  if (error || !report) {
    return null; // silent fail — don't show a broken module on /home
  }

  return (
    <div className="bg-ink border border-[color:var(--border)] rounded-2xl p-5 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-oxblood" />
        <h2 className="text-[11px] uppercase tracking-widest text-dusk font-semibold">
          Weekly Report
        </h2>
        <span className="text-[10px] text-dusk ml-auto">
          {report.week_start} → {report.week_end}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: dot graph */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dusk mb-2">
            Activity by day
          </div>
          {/* Header row with day labels */}
          <div className="grid gap-1" style={{ gridTemplateColumns: "auto repeat(7, minmax(0, 1fr))" }}>
            <div />
            {report.days.map((d) => (
              <div
                key={d.date}
                className="text-[9px] text-dusk text-center font-mono"
                title={d.date}
              >
                {shortDate(d.date).split(" ")[0]}
              </div>
            ))}
            {rowsWithCounts.map((r) => (
              <div key={r.label} className="contents">
                <div className="text-[10px] text-smoke pr-2 truncate" title={r.label}>
                  {r.label}
                </div>
                {r.counts.map((n, i) => (
                  <div
                    key={`${r.label}-${i}`}
                    className={`aspect-square rounded-sm ${intensity(n)} transition`}
                    title={`${r.label}: ${n} on ${report.days[i].date}`}
                  />
                ))}
              </div>
            ))}
          </div>
          {!report.has_data && (
            <p className="text-[11px] text-dusk italic mt-3">
              No tracked activity yet. As you click meetings, complete
              tasks, and reply to messages, the grid fills in.
            </p>
          )}
        </div>

        {/* Right: written summary */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dusk mb-2">
            Summary
          </div>
          <p className="text-[13px] text-parchment leading-relaxed">
            {report.summary}
          </p>
          <p className="text-[10px] text-dusk italic mt-3">
            Counts only. We never capture message content, email
            content, or file names.
          </p>
        </div>
      </div>
    </div>
  );
}
