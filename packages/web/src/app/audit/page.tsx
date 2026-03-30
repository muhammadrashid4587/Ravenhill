"use client";

import { useState } from "react";
import { ShieldAlert, Lock, Users, Eye, AlertTriangle } from "lucide-react";
import AuditDataGrid, { AuditEntry } from "@/components/AuditDataGrid";

/* ── Demo audit data ─────────────────────────────────────────────── */

const AUDIT_DATA: AuditEntry[] = [
  {
    id: "AUD-001",
    timestamp: "2026-03-24 09:02",
    agent: "Jordan Chen",
    action: "data_access",
    resource: "Q4 Revenue Forecast",
    classification: "confidential",
    accessLevel: "read",
    source: "192.168.1.42",
    status: "allowed",
    details: "Accessed Q4 revenue forecast spreadsheet via chat query",
  },
  {
    id: "AUD-002",
    timestamp: "2026-03-24 09:05",
    agent: "Karen Park",
    action: "share",
    resource: "Focus Group Results PDF",
    classification: "internal",
    accessLevel: "read",
    source: "192.168.1.55",
    status: "allowed",
    details: "Shared focus group results after human approval",
  },
  {
    id: "AUD-003",
    timestamp: "2026-03-24 09:08",
    agent: "Jordan Chen",
    action: "data_access",
    resource: "Acme Corp Deal Status",
    classification: "confidential",
    accessLevel: "read",
    source: "192.168.1.42",
    status: "allowed",
    details: "Retrieved deal status: $450K, closing next week",
  },
  {
    id: "AUD-004",
    timestamp: "2026-03-24 09:12",
    agent: "Karen Park",
    action: "export",
    resource: "Board Deck Draft",
    classification: "restricted",
    accessLevel: "read",
    source: "192.168.1.55",
    status: "denied",
    details: "Export request denied — restricted document requires admin approval",
  },
  {
    id: "AUD-005",
    timestamp: "2026-03-24 09:15",
    agent: "Alex Rivera",
    action: "data_modify",
    resource: "Marketing Campaign Tracker",
    classification: "internal",
    accessLevel: "write",
    source: "192.168.1.70",
    status: "allowed",
    details: "Updated Q1 campaign results with new engagement metrics",
  },
  {
    id: "AUD-006",
    timestamp: "2026-03-24 09:18",
    agent: "Sam Nakamura",
    action: "permission_change",
    resource: "Engineering Sprint Board",
    classification: "internal",
    accessLevel: "admin",
    source: "192.168.1.83",
    status: "allowed",
    details: "Granted read access to Priya Sharma for sprint review",
  },
  {
    id: "AUD-007",
    timestamp: "2026-03-24 09:22",
    agent: "Priya Sharma",
    action: "data_access",
    resource: "Product Roadmap Q2",
    classification: "confidential",
    accessLevel: "read",
    source: "192.168.1.91",
    status: "allowed",
    details: "Accessed product roadmap during planning session",
  },
  {
    id: "AUD-008",
    timestamp: "2026-03-24 09:25",
    agent: "David Kim",
    action: "data_access",
    resource: "Employee Salary Data",
    classification: "restricted",
    accessLevel: "read",
    source: "192.168.1.60",
    status: "flagged",
    details: "Access flagged — sensitive HR data accessed outside normal hours",
  },
  {
    id: "AUD-009",
    timestamp: "2026-03-24 09:30",
    agent: "Jordan Chen",
    action: "share",
    resource: "West Region Pipeline Summary",
    classification: "internal",
    accessLevel: "read",
    source: "192.168.1.42",
    status: "allowed",
    details: "Shared pipeline summary — $2.4M across 12 deals",
  },
  {
    id: "AUD-010",
    timestamp: "2026-03-24 09:33",
    agent: "Karen Park",
    action: "data_access",
    resource: "Quarterly P&L Statement",
    classification: "restricted",
    accessLevel: "read",
    source: "192.168.1.55",
    status: "allowed",
    details: "Accessed P&L for Q4 financial summary request",
  },
  {
    id: "AUD-011",
    timestamp: "2026-03-24 09:36",
    agent: "Alex Rivera",
    action: "export",
    resource: "Customer Feedback Survey",
    classification: "public",
    accessLevel: "read",
    source: "192.168.1.70",
    status: "allowed",
    details: "Exported anonymized survey results for marketing report",
  },
  {
    id: "AUD-012",
    timestamp: "2026-03-24 09:40",
    agent: "Sam Nakamura",
    action: "login",
    resource: "Ravenhill",
    classification: "internal",
    accessLevel: "admin",
    source: "10.0.0.15",
    status: "allowed",
    details: "Admin login from engineering VPN",
  },
  {
    id: "AUD-013",
    timestamp: "2026-03-24 09:42",
    agent: "David Kim",
    action: "permission_change",
    resource: "Onboarding Documents",
    classification: "confidential",
    accessLevel: "admin",
    source: "192.168.1.60",
    status: "allowed",
    details: "Revoked external contractor access to onboarding docs",
  },
  {
    id: "AUD-014",
    timestamp: "2026-03-24 09:45",
    agent: "Jordan Chen",
    action: "data_access",
    resource: "Competitor Analysis Report",
    classification: "confidential",
    accessLevel: "read",
    source: "192.168.1.42",
    status: "allowed",
    details: "Accessed competitor analysis for sales strategy meeting",
  },
  {
    id: "AUD-015",
    timestamp: "2026-03-24 09:48",
    agent: "Priya Sharma",
    action: "share",
    resource: "API Design Spec v2",
    classification: "internal",
    accessLevel: "write",
    source: "192.168.1.91",
    status: "allowed",
    details: "Shared API spec with engineering team for review",
  },
  {
    id: "AUD-016",
    timestamp: "2026-03-24 09:50",
    agent: "Karen Park",
    action: "data_modify",
    resource: "Budget Allocation Sheet",
    classification: "restricted",
    accessLevel: "write",
    source: "192.168.1.55",
    status: "denied",
    details: "Write access denied — restricted financial data requires dual approval",
  },
  {
    id: "AUD-017",
    timestamp: "2026-03-24 09:53",
    agent: "Alex Rivera",
    action: "login",
    resource: "Ravenhill",
    classification: "internal",
    accessLevel: "read",
    source: "203.0.113.42",
    status: "flagged",
    details: "Login flagged — unfamiliar external IP address",
  },
  {
    id: "AUD-018",
    timestamp: "2026-03-24 09:55",
    agent: "Sam Nakamura",
    action: "data_access",
    resource: "Infrastructure Cost Report",
    classification: "internal",
    accessLevel: "read",
    source: "10.0.0.15",
    status: "allowed",
    details: "Reviewed cloud infrastructure costs for budget meeting",
  },
];

/* ── Access permissions data ─────────────────────────────────────── */

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

/* ── Page ────────────────────────────────────────────────────────── */

type Tab = "log" | "access" | "privacy";

export default function AuditPage() {
  const [tab, setTab] = useState<Tab>("log");

  const deniedCount = AUDIT_DATA.filter((e) => e.status === "denied").length;
  const flaggedCount = AUDIT_DATA.filter((e) => e.status === "flagged").length;
  const sensitiveCount = AUDIT_DATA.filter(
    (e) => e.classification === "restricted" || e.classification === "confidential"
  ).length;

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Audit Log & Data Privacy</h1>
          <p className="text-sm text-gray-500">
            Track agent actions, data access, and enforce security policies
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Total Events</span>
            <Eye className="w-4 h-4 text-gray-600" />
          </div>
          <div className="text-2xl font-semibold">{AUDIT_DATA.length}</div>
          <div className="text-[10px] text-gray-500 mt-1">Last 24 hours</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Denied</span>
            <Lock className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-semibold text-red-400">{deniedCount}</div>
          <div className="text-[10px] text-gray-500 mt-1">Blocked by policy</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Flagged</span>
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          </div>
          <div className="text-2xl font-semibold text-yellow-400">{flaggedCount}</div>
          <div className="text-[10px] text-gray-500 mt-1">Needs review</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Sensitive Access</span>
            <ShieldAlert className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-semibold text-purple-400">{sensitiveCount}</div>
          <div className="text-[10px] text-gray-500 mt-1 mb-2">Confidential + Restricted</div>
          {/* Bar chart: allowed vs denied for sensitive access */}
          {(() => {
            const sensitive = AUDIT_DATA.filter(
              (e) => e.classification === "restricted" || e.classification === "confidential"
            );
            const allowed = sensitive.filter((e) => e.status === "allowed").length;
            const denied = sensitive.filter((e) => e.status === "denied").length;
            const flagged = sensitive.filter((e) => e.status === "flagged").length;
            const total = sensitive.length || 1;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500 w-12">Allowed</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${(allowed / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-green-400 w-4 text-right">{allowed}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500 w-12">Denied</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${(denied / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-red-400 w-4 text-right">{denied}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500 w-12">Flagged</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full"
                      style={{ width: `${(flagged / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-yellow-400 w-4 text-right">{flagged}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
        {([
          { key: "log" as Tab, label: "Audit Log", icon: ShieldAlert },
          { key: "access" as Tab, label: "Access Control", icon: Users },
          { key: "privacy" as Tab, label: "Data Privacy", icon: Lock },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition -mb-[1px] ${
              tab === key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "log" && <AuditDataGrid data={AUDIT_DATA} />}

      {tab === "access" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">
            Per-agent access permissions and resource boundaries. Agents can only access resources within their scope.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center bg-gray-900 border-b border-gray-800 px-5 py-3">
              <div className="w-[160px] text-[11px] font-medium uppercase tracking-wider text-gray-500">Agent</div>
              <div className="w-[120px] text-[11px] font-medium uppercase tracking-wider text-gray-500">Department</div>
              <div className="w-[80px] text-[11px] font-medium uppercase tracking-wider text-gray-500">Level</div>
              <div className="flex-1 text-[11px] font-medium uppercase tracking-wider text-gray-500">Allowed Resources</div>
              <div className="w-[240px] text-[11px] font-medium uppercase tracking-wider text-gray-500">Restricted From</div>
            </div>
            {/* Rows */}
            {ACCESS_RULES.map((rule) => (
              <div
                key={rule.agent}
                className="flex items-start px-5 py-3 border-b border-gray-800/50 hover:bg-gray-800/30 transition"
              >
                <div className="w-[160px] text-sm font-medium text-gray-200">{rule.agent}</div>
                <div className="w-[120px]">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                    {rule.department}
                  </span>
                </div>
                <div className="w-[80px]">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      rule.level === "admin"
                        ? "bg-purple-900/30 text-purple-400 border border-purple-800/50"
                        : rule.level === "write"
                        ? "bg-blue-900/30 text-blue-400 border border-blue-800/50"
                        : "bg-gray-800 text-gray-400 border border-gray-700"
                    }`}
                  >
                    {rule.level}
                  </span>
                </div>
                <div className="flex-1 flex flex-wrap gap-1">
                  {rule.resources.map((r) => (
                    <span
                      key={r}
                      className="text-[10px] px-2 py-0.5 rounded bg-green-900/20 text-green-400 border border-green-800/30"
                    >
                      {r}
                    </span>
                  ))}
                </div>
                <div className="w-[240px] flex flex-wrap gap-1">
                  {rule.restricted.map((r) => (
                    <span
                      key={r}
                      className="text-[10px] px-2 py-0.5 rounded bg-red-900/20 text-red-400 border border-red-800/30"
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
          <p className="text-sm text-gray-400">
            Data security policies governing how agent-accessed data is stored, masked, and retained.
          </p>

          {/* Data classification legend */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4">Data Classification Levels</h3>
            <div className="grid grid-cols-4 gap-4">
              {([
                {
                  level: "Public",
                  desc: "Open data, no restrictions",
                  color: "green",
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
                  color: "yellow",
                  examples: "Revenue forecasts, deal status",
                },
                {
                  level: "Restricted",
                  desc: "Named individuals only, dual approval",
                  color: "red",
                  examples: "Salary data, board decks, P&L",
                },
              ]).map(({ level, desc, color, examples }) => (
                <div
                  key={level}
                  className={`p-3 rounded-lg border bg-${color}-900/10 border-${color}-800/30`}
                >
                  <div className={`text-sm font-medium text-${color}-400 mb-1`}>{level}</div>
                  <div className="text-xs text-gray-400 mb-2">{desc}</div>
                  <div className="text-[10px] text-gray-600">e.g. {examples}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Security policies */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-medium mb-4">Active Security Policies</h3>
            <div className="space-y-3">
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
                  className="flex items-start gap-4 py-3 border-b border-gray-800/50 last:border-0"
                >
                  <div className="flex-1">
                    <div className="text-sm text-gray-200 font-medium">{policy}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                  </div>
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full shrink-0 ${
                      status === "Enforced"
                        ? "bg-green-900/30 text-green-400 border border-green-800/50"
                        : "bg-blue-900/30 text-blue-400 border border-blue-800/50"
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
