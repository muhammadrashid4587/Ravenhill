"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  Lock,
  Users,
  Search,
} from "lucide-react";
import { fetchActivity, streamActivity } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

/* -- Types ------------------------------------------------------------ */

interface ActivityEntry {
  id?: string;
  type: string;
  from_agent: string;
  to_agent?: string;
  description: string;
  created_at: string;
}

interface AuditRow {
  id: string;
  time: string;
  created_at: string;
  event: string;
  eventColor: string;
  eventBg: string;
  agent: string;
  description: string;
  status: "success" | "warning" | "info";
  statusLabel: string;
  _new?: boolean;
}

/* -- Mapping ---------------------------------------------------------- */

function mapActivityToAudit(entry: ActivityEntry, index: number): AuditRow {
  const map: Record<
    string,
    { event: string; color: string; bg: string; status: AuditRow["status"]; statusLabel: string }
  > = {
    route: {
      event: "Agent Routing",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      status: "info",
      statusLabel: "Info",
    },
    answer: {
      event: "Query Answered",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      status: "success",
      statusLabel: "Success",
    },
    approval: {
      event: "Approval Request",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      status: "warning",
      statusLabel: "Pending",
    },
    doc_request: {
      event: "Document Request",
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      status: "info",
      statusLabel: "Info",
    },
    approval_granted: {
      event: "Access Granted",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      status: "success",
      statusLabel: "Granted",
    },
    approval_denied: {
      event: "Access Denied",
      color: "text-red-400",
      bg: "bg-red-500/10",
      status: "warning",
      statusLabel: "Denied",
    },
  };

  const cfg = map[entry.type] ?? map.route;

  return {
    id: entry.id ?? `audit-${index}`,
    time: entry.created_at,
    created_at: entry.created_at,
    event: cfg.event,
    eventColor: cfg.color,
    eventBg: cfg.bg,
    agent: entry.from_agent,
    description: entry.description,
    status: cfg.status,
    statusLabel: cfg.statusLabel,
  };
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-400",
  warning: "bg-amber-500/10 text-amber-400",
  info: "bg-blue-500/10 text-blue-400",
};

/* -- Access permissions data (static for demo) ----------------------- */

interface AccessRule {
  agent: string;
  department: string;
  level: "read" | "write" | "admin";
  resources: string[];
  restricted: string[];
}

const ACCESS_RULES: AccessRule[] = [
  {
    agent: "Jordan Chen",
    department: "Sales",
    level: "read",
    resources: ["Sales Pipeline", "CRM Data", "Deal Status"],
    restricted: ["Employee Data", "Financial Statements"],
  },
  {
    agent: "Karen Park",
    department: "Finance",
    level: "write",
    resources: ["Financial Reports", "Budget Sheets", "P&L"],
    restricted: ["HR Records", "Engineering Specs"],
  },
  {
    agent: "Sam Nakamura",
    department: "Engineering",
    level: "admin",
    resources: ["Sprint Boards", "Infra Costs", "Code Repos"],
    restricted: ["Salary Data", "Board Decks"],
  },
  {
    agent: "David Kim",
    department: "HR",
    level: "admin",
    resources: ["Employee Records", "Onboarding Docs", "Benefits"],
    restricted: ["Financial Data", "Sales Pipeline"],
  },
  {
    agent: "Alex Rivera",
    department: "Marketing",
    level: "write",
    resources: ["Campaign Tracker", "Survey Results", "Brand Assets"],
    restricted: ["Salary Data", "Financial Statements"],
  },
  {
    agent: "Priya Sharma",
    department: "Product",
    level: "write",
    resources: ["Product Roadmap", "API Specs", "User Research"],
    restricted: ["HR Records", "Board Decks"],
  },
];

/* -- Page ------------------------------------------------------------- */

type Tab = "log" | "access" | "privacy";

export default function AuditPage() {
  const [tab, setTab] = useState<Tab>("log");
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Load initial data
  const load = useCallback(() => {
    fetchActivity(undefined, 100)
      .then((data) => {
        const entries: ActivityEntry[] = data.items ?? [];
        setAuditRows(entries.map((e, i) => mapActivityToAudit(e, i)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // SSE for real-time updates
  useEffect(() => {
    const cleanup = streamActivity((entry) => {
      const newRow: AuditRow = {
        ...mapActivityToAudit(entry as unknown as ActivityEntry, Date.now()),
        _new: true,
      };
      setAuditRows((prev) => [newRow, ...prev].slice(0, 200));
      // Remove new flag after animation
      setTimeout(() => {
        setAuditRows((prev) =>
          prev.map((r) => (r === newRow ? { ...r, _new: false } : r)),
        );
      }, 2000);
    });
    return cleanup;
  }, []);

  const filtered = auditRows.filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      row.event.toLowerCase().includes(q) ||
      row.agent.toLowerCase().includes(q) ||
      row.description.toLowerCase().includes(q)
    );
  });

  const successCount = auditRows.filter((r) => r.status === "success").length;
  const warningCount = auditRows.filter((r) => r.status === "warning").length;

  const TABS: { key: Tab; label: string }[] = [
    { key: "log", label: "Audit Log" },
    { key: "access", label: "Access Control" },
    { key: "privacy", label: "Data Privacy" },
  ];

  return (
    <div className="p-8 max-w-[1400px] page-gradient">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 mb-1">
          Audit Log
        </h1>
        <p className="text-sm text-zinc-500">
          Track agent actions and data access
        </p>
      </div>

      {/* Summary stats - typographic */}
      <div className="flex items-center gap-8 mb-8">
        <div>
          <span className="text-2xl font-semibold text-zinc-100">{auditRows.length}</span>
          <span className="text-xs text-zinc-500 ml-2">events</span>
        </div>
        <div className="w-px h-6 bg-white/[0.06]" />
        <div>
          <span className="text-2xl font-semibold text-emerald-400">{successCount}</span>
          <span className="text-xs text-zinc-500 ml-2">successful</span>
        </div>
        <div className="w-px h-6 bg-white/[0.06]" />
        <div>
          <span className="text-2xl font-semibold text-amber-400">{warningCount}</span>
          <span className="text-xs text-zinc-500 ml-2">warnings</span>
        </div>
        <div className="w-px h-6 bg-white/[0.06]" />
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-live" />
          <span className="text-xs text-zinc-400">Streaming live</span>
        </div>
      </div>

      {/* Tabs - underline style */}
      <div className="flex gap-6 border-b border-white/[0.06] mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2.5 text-sm font-medium transition-colors relative ${
              tab === t.key ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
            {tab === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-oxblood rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "log" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-white/[0.15] transition"
              />
            </div>
            <span className="text-xs text-zinc-500">
              {filtered.length} records
            </span>
          </div>

          {/* Table */}
          <div className="glass rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center px-5 py-3 border-b border-white/[0.06]">
              <div className="w-[140px] text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Time
              </div>
              <div className="w-[140px] text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Event
              </div>
              <div className="w-[130px] text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Agent
              </div>
              <div className="flex-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Description
              </div>
              <div className="w-[90px] text-[11px] font-medium uppercase tracking-wider text-zinc-600 text-right">
                Status
              </div>
            </div>

            {/* Rows */}
            <div className="max-h-[520px] overflow-y-auto">
              {filtered.length > 0 ? (
                filtered.map((row) => (
                  <div
                    key={row.id}
                    className={`flex items-center px-5 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${
                      row._new ? "animate-highlight" : ""
                    }`}
                  >
                    <div className="w-[140px] shrink-0 text-xs text-zinc-500">
                      {timeAgo(row.created_at)}
                    </div>
                    <div className="w-[140px] shrink-0">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.eventBg} ${row.eventColor}`}
                      >
                        {row.event}
                      </span>
                    </div>
                    <div className="w-[130px] shrink-0 text-sm text-zinc-300 truncate">
                      {row.agent}
                    </div>
                    <div className="flex-1 text-sm text-zinc-400 truncate pr-4">
                      {row.description}
                    </div>
                    <div className="w-[90px] shrink-0 text-right">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}
                      >
                        {row.statusLabel}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-sm text-zinc-600">
                  No audit records found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "access" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400 mb-4">
            Per-agent access permissions and resource boundaries. Agents can only
            access resources within their scope.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {ACCESS_RULES.map((rule) => (
              <div
                key={rule.agent}
                className="glass rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm text-zinc-200 font-medium">
                      {rule.agent}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {rule.department}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      rule.level === "admin"
                        ? "bg-purple-500/10 text-purple-400"
                        : rule.level === "write"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-white/[0.06] text-zinc-400"
                    }`}
                  >
                    {rule.level}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {rule.resources.map((r) => (
                    <span
                      key={r}
                      className="rounded-full px-2 py-0.5 text-[11px] bg-emerald-500/10 text-emerald-400"
                    >
                      {r}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {rule.restricted.map((r) => (
                    <span
                      key={r}
                      className="rounded-full px-2 py-0.5 text-[11px] bg-red-500/10 text-red-400"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "privacy" && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-400">
            Data security policies governing how agent-accessed data is stored,
            masked, and retained.
          </p>

          {/* Data classification legend */}
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-100 mb-4">
              Data Classification Levels
            </h3>
            <div className="grid grid-cols-4 gap-4">
              {(
                [
                  {
                    level: "Public",
                    desc: "Open data, no restrictions",
                    color: "emerald",
                    examples: "Marketing materials, public docs",
                  },
                  {
                    level: "Internal",
                    desc: "Organization-wide access",
                    color: "blue",
                    examples: "Sprint boards, campaign trackers",
                  },
                  {
                    level: "Confidential",
                    desc: "Department-level access only",
                    color: "amber",
                    examples: "Revenue forecasts, deal status",
                  },
                  {
                    level: "Restricted",
                    desc: "Named individuals only, dual approval",
                    color: "red",
                    examples: "Salary data, board decks, P&L",
                  },
                ] as const
              ).map(({ level, desc, color, examples }) => (
                <div
                  key={level}
                  className={`p-3 rounded-lg border ${
                    color === "emerald"
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : color === "blue"
                        ? "bg-blue-500/10 border-blue-500/20"
                        : color === "amber"
                          ? "bg-amber-500/10 border-amber-500/20"
                          : "bg-red-500/10 border-red-500/20"
                  }`}
                >
                  <div
                    className={`text-sm font-medium mb-1 ${
                      color === "emerald"
                        ? "text-emerald-400"
                        : color === "blue"
                          ? "text-blue-400"
                          : color === "amber"
                            ? "text-amber-400"
                            : "text-red-400"
                    }`}
                  >
                    {level}
                  </div>
                  <div className="text-xs text-zinc-400 mb-2">{desc}</div>
                  <div className="text-[11px] text-zinc-600">
                    e.g. {examples}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security policies */}
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-100 mb-4">
              Active Security Policies
            </h3>
            <div className="space-y-0">
              {[
                {
                  policy: "Append-only audit trail",
                  status: "Enforced",
                  desc: "All log entries are immutable. Records cannot be modified or deleted after creation.",
                },
                {
                  policy: "Sensitive data masking",
                  status: "Enforced",
                  desc: "Confidential and restricted resource names are masked in the audit view by default.",
                },
                {
                  policy: "Dual approval for restricted data",
                  status: "Enforced",
                  desc: "Access to restricted-class data requires approval from two authorized personnel.",
                },
                {
                  policy: "Anomaly detection",
                  status: "Active",
                  desc: "Unusual access patterns (off-hours, unfamiliar IPs) are automatically flagged for review.",
                },
                {
                  policy: "90-day retention",
                  status: "Configured",
                  desc: "Audit records are retained for 90 days. Restricted-class records are retained for 1 year.",
                },
                {
                  policy: "Encryption at rest",
                  status: "Enforced",
                  desc: "All audit data and sensitive fields are encrypted using AES-256 before storage.",
                },
              ].map(({ policy, status, desc }) => (
                <div
                  key={policy}
                  className="flex items-start gap-4 py-3 border-b border-white/[0.04] last:border-0"
                >
                  <div className="flex-1">
                    <div className="text-sm text-zinc-200 font-medium">
                      {policy}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${
                      status === "Enforced"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-blue-500/10 text-blue-400"
                    }`}
                  >
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
