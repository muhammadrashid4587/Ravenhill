"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronRight,
  Search,
  Download,
  Lock,
  Eye,
  EyeOff,
  Shield,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────── */

export type ActionType =
  | "data_access"
  | "data_modify"
  | "permission_change"
  | "login"
  | "export"
  | "share";

export type Classification = "public" | "internal" | "confidential" | "restricted";
export type AccessLevel = "read" | "write" | "admin";
export type EntryStatus = "allowed" | "denied" | "flagged";

export interface AuditEntry {
  id: string;
  timestamp: string;
  agent: string;
  action: ActionType;
  resource: string;
  classification: Classification;
  accessLevel: AccessLevel;
  source: string;
  status: EntryStatus;
  details: string;
}

/* ── Config maps ────────────────────────────────────────────────────── */

const ACTION_LABELS: Record<ActionType, string> = {
  data_access: "Data Access",
  data_modify: "Data Modify",
  permission_change: "Permission Change",
  login: "Login",
  export: "Export",
  share: "Share",
};

const CLASSIFICATION_STYLE: Record<Classification, { bg: string; text: string; border: string }> = {
  public: { bg: "bg-green-900/30", text: "text-green-400", border: "border-green-800/50" },
  internal: { bg: "bg-blue-900/30", text: "text-blue-400", border: "border-blue-800/50" },
  confidential: { bg: "bg-yellow-900/30", text: "text-yellow-400", border: "border-yellow-800/50" },
  restricted: { bg: "bg-red-900/30", text: "text-red-400", border: "border-red-800/50" },
};

const STATUS_STYLE: Record<EntryStatus, { bg: string; text: string; border: string }> = {
  allowed: { bg: "bg-green-900/30", text: "text-green-400", border: "border-green-800/50" },
  denied: { bg: "bg-red-900/30", text: "text-red-400", border: "border-red-800/50" },
  flagged: { bg: "bg-yellow-900/30", text: "text-yellow-400", border: "border-yellow-800/50" },
};

/* ── Column definitions ─────────────────────────────────────────────── */

type SortKey = keyof AuditEntry;
type SortDir = "asc" | "desc";
type GroupKey = "none" | "agent" | "action" | "classification" | "status";

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: "timestamp", label: "Timestamp", width: "w-[140px]" },
  { key: "agent", label: "Agent", width: "w-[130px]" },
  { key: "action", label: "Action", width: "w-[130px]" },
  { key: "resource", label: "Resource", width: "min-w-[160px] flex-1" },
  { key: "classification", label: "Classification", width: "w-[120px]" },
  { key: "accessLevel", label: "Access", width: "w-[80px]" },
  { key: "status", label: "Status", width: "w-[90px]" },
  { key: "source", label: "Source", width: "w-[120px]" },
];

const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: "none", label: "No Grouping" },
  { value: "agent", label: "By Agent" },
  { value: "action", label: "By Action" },
  { value: "classification", label: "By Classification" },
  { value: "status", label: "By Status" },
];

/* ── Helpers ─────────────────────────────────────────────────────────── */

function compareEntries(a: AuditEntry, b: AuditEntry, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  const cmp = String(av).localeCompare(String(bv));
  return dir === "asc" ? cmp : -cmp;
}

function groupEntries(entries: AuditEntry[], key: GroupKey): Map<string, AuditEntry[]> {
  if (key === "none") return new Map([["all", entries]]);
  const groups = new Map<string, AuditEntry[]>();
  for (const entry of entries) {
    const groupValue = String(entry[key]);
    const label =
      key === "action" ? ACTION_LABELS[entry.action] ?? groupValue :
      key === "classification" ? groupValue.charAt(0).toUpperCase() + groupValue.slice(1) :
      key === "status" ? groupValue.charAt(0).toUpperCase() + groupValue.slice(1) :
      groupValue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return groups;
}

/* ── Masking for sensitive fields ────────────────────────────────────── */

function maskValue(value: string, classification: Classification, masked: boolean): string {
  if (!masked) return value;
  if (classification === "restricted" || classification === "confidential") {
    if (value.length <= 4) return "****";
    return value.slice(0, 2) + "***" + value.slice(-2);
  }
  return value;
}

/* ── Component ───────────────────────────────────────────────────────── */

interface AuditDataGridProps {
  data: AuditEntry[];
}

export default function AuditDataGrid({ data }: AuditDataGridProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [maskSensitive, setMaskSensitive] = useState(true);
  const [filterAction, setFilterAction] = useState<ActionType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<EntryStatus | "all">("all");
  const [filterClassification, setFilterClassification] = useState<Classification | "all">("all");

  // Filter
  const filtered = useMemo(() => {
    return data.filter((e) => {
      if (filterAction !== "all" && e.action !== filterAction) return false;
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      if (filterClassification !== "all" && e.classification !== filterClassification) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.agent.toLowerCase().includes(q) ||
          e.resource.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, filterAction, filterStatus, filterClassification]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => compareEntries(a, b, sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  // Group
  const groups = useMemo(() => groupEntries(sorted, groupBy), [sorted, groupBy]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleExport = () => {
    const header = COLUMNS.map((c) => c.label).join(",");
    const rows = sorted.map((e) =>
      COLUMNS.map((c) => {
        const val = e[c.key];
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-600" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-blue-400" />
    ) : (
      <ChevronDown className="w-3 h-3 text-blue-400" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search agents, resources, details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-gray-700"
          />
        </div>

        {/* Action filter */}
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value as ActionType | "all")}
          className="text-xs px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-300 focus:outline-none focus:border-gray-700"
        >
          <option value="all">All Actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as EntryStatus | "all")}
          className="text-xs px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-300 focus:outline-none focus:border-gray-700"
        >
          <option value="all">All Statuses</option>
          <option value="allowed">Allowed</option>
          <option value="denied">Denied</option>
          <option value="flagged">Flagged</option>
        </select>

        {/* Classification filter */}
        <select
          value={filterClassification}
          onChange={(e) => setFilterClassification(e.target.value as Classification | "all")}
          className="text-xs px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-300 focus:outline-none focus:border-gray-700"
        >
          <option value="all">All Classifications</option>
          <option value="public">Public</option>
          <option value="internal">Internal</option>
          <option value="confidential">Confidential</option>
          <option value="restricted">Restricted</option>
        </select>

        {/* Group by */}
        <select
          value={groupBy}
          onChange={(e) => {
            setGroupBy(e.target.value as GroupKey);
            setCollapsedGroups(new Set());
          }}
          className="text-xs px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-300 focus:outline-none focus:border-gray-700"
        >
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Mask toggle */}
        <button
          onClick={() => setMaskSensitive(!maskSensitive)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition ${
            maskSensitive
              ? "bg-blue-600/10 text-blue-400 border-blue-800/30"
              : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
          }`}
          title={maskSensitive ? "Sensitive data masked" : "Sensitive data visible"}
        >
          {maskSensitive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {maskSensitive ? "Masked" : "Visible"}
        </button>

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{filtered.length} records</span>
        <span className="text-gray-700">|</span>
        <span className="flex items-center gap-1">
          <Shield className="w-3 h-3" />
          {filtered.filter((e) => e.status === "denied").length} denied
        </span>
        <span className="flex items-center gap-1">
          <Lock className="w-3 h-3" />
          {filtered.filter((e) => e.classification === "restricted" || e.classification === "confidential").length} sensitive
        </span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="flex items-center bg-gray-900 border-b border-gray-800 px-4 py-2.5 sticky top-0 z-10">
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => handleSort(col.key)}
              className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-gray-500 hover:text-gray-300 transition ${col.width} shrink-0 px-1`}
            >
              {col.label}
              <SortIcon col={col.key} />
            </button>
          ))}
        </div>

        {/* Rows */}
        <div className="max-h-[560px] overflow-y-auto">
          {Array.from(groups.entries()).map(([label, entries]) => (
            <div key={label}>
              {/* Group header */}
              {groupBy !== "none" && (
                <button
                  onClick={() => toggleGroup(label)}
                  className="flex items-center gap-2 w-full px-4 py-2 bg-gray-800/50 border-b border-gray-800 text-xs font-medium text-gray-300 hover:bg-gray-800/70 transition"
                >
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      !collapsedGroups.has(label) ? "rotate-90" : ""
                    }`}
                  />
                  {label}
                  <span className="text-gray-600 font-normal">({entries.length})</span>
                </button>
              )}

              {/* Group rows */}
              {!collapsedGroups.has(label) &&
                entries.map((entry) => {
                  const cls = CLASSIFICATION_STYLE[entry.classification];
                  const sts = STATUS_STYLE[entry.status];

                  return (
                    <div
                      key={entry.id}
                      className="flex items-center px-4 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/30 transition text-sm group"
                    >
                      {/* Timestamp */}
                      <div className="w-[140px] shrink-0 px-1 text-xs text-gray-400 font-mono">
                        {entry.timestamp}
                      </div>

                      {/* Agent */}
                      <div className="w-[130px] shrink-0 px-1 text-xs text-gray-200 font-medium truncate">
                        {entry.agent}
                      </div>

                      {/* Action */}
                      <div className="w-[130px] shrink-0 px-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                          {ACTION_LABELS[entry.action]}
                        </span>
                      </div>

                      {/* Resource */}
                      <div className="min-w-[160px] flex-1 shrink-0 px-1 text-xs text-gray-300 truncate" title={entry.resource}>
                        {maskValue(entry.resource, entry.classification, maskSensitive)}
                      </div>

                      {/* Classification */}
                      <div className="w-[120px] shrink-0 px-1">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${cls.bg} ${cls.text} border ${cls.border}`}
                        >
                          {entry.classification}
                        </span>
                      </div>

                      {/* Access Level */}
                      <div className="w-[80px] shrink-0 px-1 text-xs text-gray-400">
                        {entry.accessLevel}
                      </div>

                      {/* Status */}
                      <div className="w-[90px] shrink-0 px-1">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${sts.bg} ${sts.text} border ${sts.border}`}
                        >
                          {entry.status}
                        </span>
                      </div>

                      {/* Source */}
                      <div className="w-[120px] shrink-0 px-1 text-xs text-gray-500 font-mono truncate">
                        {maskValue(entry.source, entry.classification, maskSensitive)}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-600 text-sm">
              No audit records match your filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
