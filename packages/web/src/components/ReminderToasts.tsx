"use client";

import { Bell, ExternalLink, X } from "lucide-react";
import { useReminders } from "@/lib/RemindersContext";

function formatDelta(fireAt: number): string {
  const diffMs = Date.now() - fireAt;
  const sec = Math.round(Math.abs(diffMs) / 1000);
  if (sec < 60) return diffMs >= 0 ? "just now" : `in ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return diffMs >= 0 ? `${min} min ago` : `in ${min} min`;
  const hr = Math.round(min / 60);
  return diffMs >= 0 ? `${hr}h ago` : `in ${hr}h`;
}

export default function ReminderToasts() {
  const { activeToasts, dismissToast } = useReminders();

  if (activeToasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Reminders"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[360px] w-[calc(100vw-2rem)] sm:w-[360px]"
    >
      {activeToasts.map((toast) => {
        const r = toast.reminder;
        return (
          <div
            key={toast.id}
            className="bg-elevated border border-white/[0.12] rounded-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] overflow-hidden animate-fade-up"
            style={{ animationDuration: "200ms" }}
          >
            <div className="flex items-start gap-3 p-4">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-[var(--brand-soft)] border border-[var(--brand-ring)] flex items-center justify-center">
                <Bell className="w-4 h-4 text-[var(--brand-hover)]" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-semibold text-bone leading-tight">
                    Reminder · {r.title}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="Dismiss reminder"
                    className="text-smoke hover:text-bone transition shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {r.body && (
                  <p className="text-[12px] text-parchment/80 mt-1 line-clamp-3">
                    {r.body}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-smoke">
                    {formatDelta(r.fireAt)}
                  </span>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-[var(--brand-hover)] hover:underline"
                    >
                      Join <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
