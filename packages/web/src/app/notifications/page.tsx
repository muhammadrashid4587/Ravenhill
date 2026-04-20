"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Check,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Circle,
} from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/mocks";
import type { NotificationItem, VerificationStatus } from "@/lib/types";

type FilterMode = "all" | "unread";

const VERIFICATION_BADGE: Record<
  VerificationStatus,
  { tone: string; Icon: typeof ShieldCheck; label: string }
> = {
  verified: {
    tone: "bg-[rgba(63,164,106,0.10)] text-[#88D3A4] border-[rgba(63,164,106,0.30)]",
    Icon: ShieldCheck,
    label: "Verified",
  },
  inferred: {
    tone: "bg-[rgba(201,138,43,0.10)] text-[#E6BA75] border-[rgba(201,138,43,0.30)]",
    Icon: ShieldAlert,
    label: "Inferred",
  },
  unverified: {
    tone: "bg-white/[0.04] text-parchment border-white/[0.10]",
    Icon: HelpCircle,
    label: "Unverified",
  },
};

function relativeTime(iso: string): string {
  const diffMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.round(diffHr)}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchNotifications().then((n) => {
      setItems(n);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.read) : items),
    [items, filter],
  );

  const unreadCount = items.filter((n) => !n.read).length;

  const handleToggleRead = async (n: NotificationItem) => {
    const next = await markNotificationRead(n.id, !n.read);
    if (next) setItems((xs) => xs.map((x) => (x.id === n.id ? next : x)));
  };

  const handleMarkAllRead = async () => {
    setBusy(true);
    await markAllNotificationsRead();
    const fresh = await fetchNotifications();
    setItems(fresh);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <Bell className="w-4 h-4 text-claret" /> Notifications
              {unreadCount > 0 && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-oxblood text-bone">
                  {unreadCount} new
                </span>
              )}
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Changes and actions the agent surfaced. Verification is a badge,
              not a footnote.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-white/[0.08] overflow-hidden">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[11px] px-2.5 py-1 transition capitalize ${
                    filter === f
                      ? "bg-white/[0.08] text-bone"
                      : "text-smoke hover:text-parchment hover:bg-white/[0.04]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={handleMarkAllRead}
              disabled={busy || unreadCount === 0}
              className="btn btn-secondary text-[12px] px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-3xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] px-6 py-12 text-center">
            <Bell className="w-5 h-5 text-dusk mx-auto mb-2" />
            <p className="text-[13px] text-smoke">
              {filter === "unread"
                ? "All caught up — no unread notifications."
                : "Nothing to surface yet. Quiet is good."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((n) => {
              const badge = VERIFICATION_BADGE[n.verification];
              const BadgeIcon = badge.Icon;
              const Body = (
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-bone">
                      {n.action}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.tone}`}
                    >
                      <BadgeIcon className="w-2.5 h-2.5" />
                      {badge.label}
                    </span>
                    {n.actor && (
                      <span className="text-[11px] text-dusk">
                        · {n.actor}
                      </span>
                    )}
                    {n.source && (
                      <span className="text-[11px] text-dusk font-mono">
                        {n.source}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-smoke mt-0.5 leading-relaxed">
                    {n.change_summary}
                  </p>
                  <div className="text-[10px] text-dusk mt-1">
                    {relativeTime(n.created_at)}
                  </div>
                </div>
              );

              const rowClass = `flex items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                n.read
                  ? "border-white/[0.04] bg-transparent"
                  : "border-white/[0.08] bg-white/[0.02]"
              } hover:border-white/[0.12]`;

              return (
                <div key={n.id} className={rowClass}>
                  <button
                    onClick={() => handleToggleRead(n)}
                    className="shrink-0 mt-1 text-dusk hover:text-parchment transition"
                    aria-label={n.read ? "Mark unread" : "Mark read"}
                  >
                    {n.read ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 fill-claret text-claret" />
                    )}
                  </button>
                  {n.href ? (
                    <Link href={n.href} className="flex-1 min-w-0">
                      {Body}
                    </Link>
                  ) : (
                    Body
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
