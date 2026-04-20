"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Users,
  Activity,
  Network,
  MessageSquare,
  Mail,
  Calendar as CalIcon,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { fetchAdminStats } from "@/lib/mocks";
import type { AdminOrgStats } from "@/lib/types";
import PremiumLock from "@/components/ui/PremiumLock";

function relativeTime(iso: string): string {
  const diffMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.round(diffHr)}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminOrgStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminStats().then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div>
          <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-claret" /> Admin dashboard
          </h1>
          <p className="text-xs text-smoke mt-0.5">
            Org-level health and ingestion. No per-user data — architectural
            isolation.
          </p>
        </div>
      </header>

      <div className="p-6 max-w-5xl space-y-6">
        <div className="rounded-lg border border-[rgba(90,127,174,0.30)] bg-[rgba(90,127,174,0.06)] px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#9BB4D4] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#9BB4D4] leading-relaxed">
            Admins cannot see any individual user&apos;s shadow profile,
            messages, or approval content. Only aggregate counts appear here.
          </p>
        </div>

        {loading || !stats ? (
          <div className="flex items-center justify-center py-16">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-[11px] text-dusk uppercase tracking-wide mb-2">
                Users
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <Stat
                  icon={<Users className="w-3.5 h-3.5" />}
                  label="Total users"
                  value={fmt(stats.total_users)}
                />
                <Stat
                  icon={<Activity className="w-3.5 h-3.5" />}
                  label="Active 24h"
                  value={fmt(stats.active_users_24h)}
                  hint={`${Math.round(
                    (stats.active_users_24h / Math.max(stats.total_users, 1)) *
                      100,
                  )}% of org`}
                />
                <Stat
                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                  label="Active agents"
                  value={fmt(stats.active_agents)}
                />
              </div>
            </section>

            <section>
              <h2 className="text-[11px] text-dusk uppercase tracking-wide mb-2">
                Ingestion (last 24h)
              </h2>
              <div className="grid grid-cols-4 gap-3">
                <Stat
                  icon={<MessageSquare className="w-3.5 h-3.5" />}
                  label="Slack events"
                  value={fmt(stats.ingestion.slack_events_24h)}
                />
                <Stat
                  icon={<Mail className="w-3.5 h-3.5" />}
                  label="Gmail events"
                  value={fmt(stats.ingestion.gmail_events_24h)}
                />
                <Stat
                  icon={<CalIcon className="w-3.5 h-3.5" />}
                  label="Calendar events"
                  value={fmt(stats.ingestion.calendar_events_24h)}
                />
                <Stat
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Last sync"
                  value={relativeTime(stats.ingestion.last_sync_at)}
                />
              </div>
            </section>

            <section>
              <h2 className="text-[11px] text-dusk uppercase tracking-wide mb-2">
                Knowledge graph
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <Stat
                  icon={<Network className="w-3.5 h-3.5" />}
                  label="Nodes"
                  value={fmt(stats.graph.nodes)}
                />
                <Stat
                  icon={<Network className="w-3.5 h-3.5" />}
                  label="Edges"
                  value={fmt(stats.graph.edges)}
                />
                <Stat
                  icon={<Network className="w-3.5 h-3.5" />}
                  label="Topics"
                  value={fmt(stats.graph.topics)}
                />
              </div>
            </section>

            <section>
              <h2 className="text-[11px] text-dusk uppercase tracking-wide mb-2">
                Approvals
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <Stat
                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                  label="Pending"
                  value={fmt(stats.approvals.pending)}
                />
                <Stat
                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                  label="Resolved 24h"
                  value={fmt(stats.approvals.resolved_24h)}
                />
                <Stat
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Avg resolution"
                  value={`${stats.approvals.avg_resolution_minutes}m`}
                />
              </div>
            </section>

            <section>
              <h2 className="text-[11px] text-dusk uppercase tracking-wide mb-2">
                Premium add-ons
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PremiumLock
                  variant="card"
                  feature="SSO / SAML"
                  hint="Okta, Azure AD, Google Workspace SSO. Required for orgs ≥ 100 seats."
                />
                <PremiumLock
                  variant="card"
                  feature="Analytics export"
                  hint="Scheduled CSV / BigQuery exports for audit + BI tools."
                />
                <PremiumLock
                  variant="card"
                  feature="Custom retention"
                  hint="Per-scope retention windows beyond the 90-day default."
                />
                <PremiumLock
                  variant="card"
                  feature="Priority ingestion"
                  hint="Dedicated Slack / Gmail adapter capacity and faster sync cadence."
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-ink p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-dusk uppercase tracking-wide">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-xl font-semibold text-bone tabular-nums mt-1">
        {value}
      </div>
      {hint && <div className="text-[11px] text-smoke mt-0.5">{hint}</div>}
    </div>
  );
}
