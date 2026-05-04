"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Download,
  Users,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ChevronLeft,
  FileText,
  Building2,
} from "lucide-react";
import {
  fetchHRISProviders,
  pullHRISRoster,
  parseHRISCsv,
  type HRISProvider,
  type HRISProviderId,
  type HRISRosterRow,
} from "@/lib/mocks";
import { createAgent } from "@/lib/api";

type ImportStatus = "pending" | "creating" | "done" | "failed";

interface ImportRow extends HRISRosterRow {
  status: ImportStatus;
  error?: string;
  id?: string;
}

function rosterToAgentPayload(row: HRISRosterRow) {
  return {
    name: row.name,
    role: row.role,
    departments: [row.department],
    knowledge_areas: [row.department.toLowerCase(), row.role.toLowerCase()],
    knowledge_base: `Imported from HRIS. ${row.role} in ${row.department}.${
      row.manager ? ` Reports to ${row.manager}.` : ""
    }`,
    scopes: ["read:public"],
  };
}

export default function HRISImportPage() {
  const [providers, setProviders] = useState<HRISProvider[]>([]);
  const [selectedProvider, setSelectedProvider] =
    useState<HRISProviderId | null>(null);
  const [pulling, setPulling] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [csvText, setCsvText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchHRISProviders().then(setProviders);
  }, []);

  const handlePull = async (id: HRISProviderId) => {
    setSelectedProvider(id);
    setPulling(true);
    try {
      const roster = await pullHRISRoster(id);
      setRows(roster.map((r) => ({ ...r, status: "pending" })));
    } finally {
      setPulling(false);
    }
  };

  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    const parsed = parseHRISCsv(text);
    if (parsed.length === 0) {
      alert(
        "Couldn't parse that CSV. Make sure the first row has headers: name,email,role,department,manager,start_date,employment_type",
      );
      return;
    }
    setSelectedProvider(null);
    setRows(parsed.map((r) => ({ ...r, status: "pending" })));
  };

  const handleImport = async () => {
    if (rows.length === 0 || importing) return;
    setImporting(true);
    const next: ImportRow[] = [...rows];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status === "done") continue;
      next[i] = { ...next[i], status: "creating" };
      setRows([...next]);
      try {
        const created = await createAgent(rosterToAgentPayload(next[i]));
        next[i] = {
          ...next[i],
          status: "done",
          id: (created as { id?: string }).id,
        };
      } catch (e) {
        next[i] = {
          ...next[i],
          status: "failed",
          error: e instanceof Error ? e.message : "unknown error",
        };
      }
      setRows([...next]);
    }
    setImporting(false);
  };

  const handleReset = () => {
    setRows([]);
    setSelectedProvider(null);
    setCsvText("");
  };

  const summary = {
    total: rows.length,
    done: rows.filter((r) => r.status === "done").length,
    failed: rows.filter((r) => r.status === "failed").length,
    pending: rows.filter((r) => r.status === "pending").length,
  };

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="text-xs text-smoke hover:text-parchment flex items-center gap-1 transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Settings
          </Link>
          <span className="text-dusk">/</span>
          <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
            <Building2 className="w-4 h-4 text-claret" /> HRIS Import
          </h1>
        </div>
        <p className="text-xs text-smoke mt-1">
          Pull your current roster from your HRIS so every employee gets an
          agent on day one.
        </p>
      </header>

      <div className="p-6 max-w-4xl space-y-6">
        {/* Step 1: Source */}
        <section className="animate-fade-up">
          <h2 className="text-sm font-medium text-parchment mb-3">
            1. Pick a source
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 stagger">
            {providers.map((p) => {
              const active = selectedProvider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePull(p.id)}
                  disabled={pulling || importing}
                  className={`bg-ink border rounded-xl p-4 text-left transition card-lift animate-fade-up disabled:opacity-50 ${
                    active
                      ? "border-claret/60 shadow-[0_0_24px_-8px_rgba(201,68,58,0.45)]"
                      : "border-white/[0.06] hover:border-white/[0.14]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-bone">
                      {p.name}
                    </span>
                    {active && pulling && (
                      <span className="w-3 h-3 border-2 border-claret border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-dusk">
                    <Users className="w-3 h-3" /> {p.seat_count} seats
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-ink border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-3.5 h-3.5 text-smoke" />
              <h3 className="text-sm font-medium text-parchment">
                Or upload a CSV
              </h3>
            </div>
            <p className="text-[11px] text-dusk mb-3">
              Headers expected:{" "}
              <code className="text-parchment bg-white/[0.04] px-1 rounded">
                name, email, role, department, manager, start_date,
                employment_type
              </code>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-md px-3 py-1.5 transition disabled:opacity-50"
              >
                <Upload className="w-3 h-3" /> Choose CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvFile(f);
                }}
              />
              {csvText && (
                <span className="text-[11px] text-smoke">
                  {csvText.split("\n").length - 1} rows parsed
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Step 2: Preview */}
        {rows.length > 0 && (
          <section className="animate-fade-up">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-parchment">
                2. Preview & import
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-dusk">
                  {summary.total} rows · {summary.done} imported ·{" "}
                  {summary.failed} failed
                </span>
                <button
                  onClick={handleReset}
                  disabled={importing}
                  className="text-[11px] text-smoke hover:text-parchment transition disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="bg-ink border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1.5fr_1.2fr_1fr_0.8fr_auto] gap-3 px-4 py-2 text-[10px] uppercase tracking-wide text-dusk border-b border-white/[0.06]">
                <span>Name</span>
                <span>Role</span>
                <span>Department</span>
                <span>Manager</span>
                <span>Status</span>
              </div>
              <ul className="max-h-[420px] overflow-y-auto">
                {rows.map((r, i) => (
                  <li
                    key={`${r.email}-${i}`}
                    className="grid grid-cols-[1.5fr_1.2fr_1fr_0.8fr_auto] gap-3 px-4 py-2.5 text-xs border-b border-white/[0.03] last:border-b-0"
                  >
                    <div className="min-w-0">
                      <span className="text-bone truncate block">{r.name}</span>
                      <span className="text-[11px] text-dusk truncate block">
                        {r.email}
                      </span>
                    </div>
                    <span className="text-parchment truncate">{r.role}</span>
                    <span className="text-smoke truncate">{r.department}</span>
                    <span className="text-smoke truncate">
                      {r.manager ?? "—"}
                    </span>
                    <StatusBadge status={r.status} error={r.error} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleImport}
                disabled={importing || summary.pending === 0}
                className="flex items-center gap-2 bg-oxblood hover:bg-claret text-bone text-sm px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <span className="w-3 h-3 border-2 border-bone border-t-transparent rounded-full animate-spin" />
                    Creating agents… {summary.done}/{summary.total}
                  </>
                ) : summary.pending === 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Done
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Import {summary.pending} rows
                    into Ravenhill
                  </>
                )}
              </button>
              {summary.done > 0 && (
                <Link
                  href="/organization"
                  className="flex items-center gap-1 text-xs text-smoke hover:text-parchment transition"
                >
                  View in Organization <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>

            <p className="text-[11px] text-dusk mt-3">
              Each row is sent to <code>POST /api/agents/</code>. Live HRIS OAuth
              (Rippling/Gusto/etc.) lands in Phase 2; today the &quot;Pull&quot;
              button returns a representative roster so you can exercise the
              import flow end-to-end.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: ImportStatus;
  error?: string;
}) {
  if (status === "done") {
    return (
      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-[rgba(34,197,94,0.14)] text-[#4ADE80] border-[rgba(34,197,94,0.40)]">
        <CheckCircle2 className="w-2.5 h-2.5" /> imported
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        title={error}
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-[rgba(220,38,38,0.14)] text-[#F87171] border-[rgba(220,38,38,0.40)]"
      >
        <XCircle className="w-2.5 h-2.5" /> failed
      </span>
    );
  }
  if (status === "creating") {
    return (
      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-[rgba(234,179,8,0.14)] text-[#FACC15] border-[rgba(234,179,8,0.40)]">
        <span className="w-2 h-2 border border-[#FACC15] border-t-transparent rounded-full animate-spin" />
        creating
      </span>
    );
  }
  return (
    <span className="text-[10px] text-dusk px-1.5 py-0.5 rounded border bg-white/[0.02] border-white/[0.08]">
      pending
    </span>
  );
}
