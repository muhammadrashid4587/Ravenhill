"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
} from "lucide-react";
import {
  fetchPermissions,
  createPermission,
  updatePermission,
  deletePermission,
} from "@/lib/mocks";
import { useAuth } from "@/lib/AuthContext";
import type {
  Permission,
  PermissionScopeKind,
  PermissionMode,
  ReadyState,
} from "@/lib/types";

const SCOPE_KINDS: Array<{ id: PermissionScopeKind; label: string; hint: string }> = [
  { id: "team", label: "Team", hint: "e.g. Finance, Sales, Engineering" },
  { id: "topic", label: "Topic", hint: "e.g. burn rate, pricing, onboarding" },
  { id: "person", label: "Person", hint: "Specific individual or agent id" },
  {
    id: "classification",
    label: "Classification",
    hint: "e.g. confidential, pii, legal-hold",
  },
  { id: "external", label: "External", hint: "Parties outside the org" },
];

const MODES: Array<{ id: PermissionMode; label: string; hint: string }> = [
  {
    id: "standing",
    label: "Standing",
    hint: "Always applies until revoked.",
  },
  {
    id: "on_demand",
    label: "On demand",
    hint: "Requires per-request approval.",
  },
];

const READY_STATES: Array<{ id: ReadyState; label: string }> = [
  { id: "not_ready", label: "Not ready (default)" },
  { id: "ready", label: "Ready" },
];

interface DraftRow {
  scope_kind: PermissionScopeKind;
  scope_value: string;
  mode: PermissionMode;
  allow: boolean;
  default_ready_state: ReadyState;
  note: string;
}

const emptyDraft = (): DraftRow => ({
  scope_kind: "topic",
  scope_value: "",
  mode: "standing",
  allow: false,
  default_ready_state: "not_ready",
  note: "",
});

export default function PermissionsSettingsPage() {
  const { agent: myAgent } = useAuth();
  const [rows, setRows] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const [draft, setDraft] = useState<DraftRow>(emptyDraft());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchPermissions().then((p) => {
      setRows(p);
      setLoading(false);
    });
  }, []);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleCreate = async () => {
    if (!draft.scope_value.trim()) {
      flashToast("Scope value is required.");
      return;
    }
    setSaving("new");
    const row = await createPermission({
      user_id: myAgent?.id ?? "me",
      scope_kind: draft.scope_kind,
      scope_value: draft.scope_value.trim(),
      mode: draft.mode,
      allow: draft.allow,
      default_ready_state: draft.default_ready_state,
      note: draft.note.trim() || undefined,
    });
    setRows((r) => [...r, row]);
    setDraft(emptyDraft());
    setShowDraft(false);
    setSaving(null);
    flashToast("Permission saved (mock).");
  };

  const handleToggleAllow = async (row: Permission) => {
    setSaving(row.id);
    const next = await updatePermission(row.id, { allow: !row.allow });
    if (next) setRows((r) => r.map((x) => (x.id === next.id ? next : x)));
    setSaving(null);
  };

  const handleChangeMode = async (row: Permission, mode: PermissionMode) => {
    setSaving(row.id);
    const next = await updatePermission(row.id, { mode });
    if (next) setRows((r) => r.map((x) => (x.id === next.id ? next : x)));
    setSaving(null);
  };

  const handleChangeReady = async (row: Permission, ready: ReadyState) => {
    setSaving(row.id);
    const next = await updatePermission(row.id, { default_ready_state: ready });
    if (next) setRows((r) => r.map((x) => (x.id === next.id ? next : x)));
    setSaving(null);
  };

  const handleDelete = async (row: Permission) => {
    setSaving(row.id);
    const ok = await deletePermission(row.id);
    if (ok) setRows((r) => r.filter((x) => x.id !== row.id));
    setSaving(null);
    flashToast("Removed.");
  };

  const grouped = SCOPE_KINDS.map((k) => ({
    ...k,
    items: rows.filter((r) => r.scope_kind === k.id),
  }));

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-[11px] text-dusk hover:text-parchment transition mb-2"
        >
          <ArrowLeft className="w-3 h-3" /> Settings
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-claret" /> Permissions
            </h1>
            <p className="text-xs text-smoke mt-0.5 max-w-2xl">
              Control what your agent can share, with whom, on its own. Default is{" "}
              <span className="text-parchment">not ready</span> — nothing leaves
              your agent without a rule or an approval.
            </p>
          </div>
          <button
            onClick={() => setShowDraft((v) => !v)}
            className="btn btn-primary text-sm px-4 py-2 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> New rule
          </button>
        </div>
      </header>

      <div className="p-6 max-w-4xl">
        <div className="mb-4 rounded-lg border border-[rgba(201,138,43,0.30)] bg-[rgba(201,138,43,0.08)] px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#E6BA75] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#E6BA75] leading-relaxed">
            Schema in flight — coordinating with Muhammad before his migration.
            Rule edits are persisted client-side for now. Do not rely on these
            rules for production gating until the backend lands.
          </p>
        </div>

        {showDraft && (
          <div className="bg-ink border border-white/[0.08] rounded-xl p-4 mb-5 animate-fade-up">
            <div className="text-[11px] text-dusk uppercase tracking-wide mb-3">
              New rule
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <Label>Scope kind</Label>
                <select
                  value={draft.scope_kind}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scope_kind: e.target.value as PermissionScopeKind,
                    })
                  }
                  className="input-dark w-full"
                >
                  {SCOPE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <Hint>
                  {
                    SCOPE_KINDS.find((k) => k.id === draft.scope_kind)?.hint
                  }
                </Hint>
              </div>
              <div className="col-span-6">
                <Label>Scope value</Label>
                <input
                  value={draft.scope_value}
                  onChange={(e) =>
                    setDraft({ ...draft, scope_value: e.target.value })
                  }
                  placeholder="e.g. Finance, burn rate, confidential…"
                  className="input-dark w-full"
                />
              </div>
              <div className="col-span-6">
                <Label>Mode</Label>
                <select
                  value={draft.mode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      mode: e.target.value as PermissionMode,
                    })
                  }
                  className="input-dark w-full"
                >
                  {MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <Hint>{MODES.find((m) => m.id === draft.mode)?.hint}</Hint>
              </div>
              <div className="col-span-6">
                <Label>Default ready state</Label>
                <select
                  value={draft.default_ready_state}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      default_ready_state: e.target.value as ReadyState,
                    })
                  }
                  className="input-dark w-full"
                >
                  {READY_STATES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12">
                <Label>Allow when scope matches</Label>
                <div className="inline-flex rounded-md border border-white/[0.08] overflow-hidden">
                  <button
                    onClick={() => setDraft({ ...draft, allow: true })}
                    className={`text-[11px] px-3 py-1.5 transition ${
                      draft.allow
                        ? "bg-[rgba(63,164,106,0.15)] text-[#88D3A4]"
                        : "text-smoke hover:text-parchment"
                    }`}
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => setDraft({ ...draft, allow: false })}
                    className={`text-[11px] px-3 py-1.5 transition ${
                      !draft.allow
                        ? "bg-[rgba(201,68,58,0.15)] text-[#E68A82]"
                        : "text-smoke hover:text-parchment"
                    }`}
                  >
                    Deny
                  </button>
                </div>
              </div>
              <div className="col-span-12">
                <Label>Note (optional)</Label>
                <input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="Why this rule exists — shows up in audit logs."
                  className="input-dark w-full"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setDraft(emptyDraft());
                  setShowDraft(false);
                }}
                className="btn btn-ghost text-[12px] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving === "new"}
                className="btn btn-primary text-[12px] px-3 py-1.5 inline-flex items-center gap-1.5"
              >
                <Save className="w-3 h-3" />
                {saving === "new" ? "Saving…" : "Save rule"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.id}>
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-sm font-medium text-parchment">
                    {group.label}
                  </h2>
                  <span className="text-[11px] text-dusk">
                    {group.items.length} rule
                    {group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                {group.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-[12px] text-dusk">
                    No rules yet. {group.hint}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                    {group.items.map((row, i) => (
                      <div
                        key={row.id}
                        className={`grid grid-cols-12 gap-3 items-center px-3 py-2.5 ${
                          i !== 0 ? "border-t border-white/[0.04]" : ""
                        } ${saving === row.id ? "opacity-60" : ""}`}
                      >
                        <div className="col-span-4">
                          <div className="text-[13px] text-bone truncate">
                            {row.scope_value}
                          </div>
                          {row.note && (
                            <div className="text-[10px] text-dusk truncate">
                              {row.note}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2">
                          <select
                            value={row.mode}
                            onChange={(e) =>
                              handleChangeMode(
                                row,
                                e.target.value as PermissionMode,
                              )
                            }
                            className="input-dark text-[11px] w-full py-1"
                          >
                            {MODES.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <select
                            value={row.default_ready_state}
                            onChange={(e) =>
                              handleChangeReady(
                                row,
                                e.target.value as ReadyState,
                              )
                            }
                            className="input-dark text-[11px] w-full py-1"
                          >
                            {READY_STATES.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <button
                            onClick={() => handleToggleAllow(row)}
                            className={`text-[11px] w-full px-2 py-1 rounded-md border transition ${
                              row.allow
                                ? "bg-[rgba(63,164,106,0.10)] text-[#88D3A4] border-[rgba(63,164,106,0.30)]"
                                : "bg-[rgba(201,68,58,0.10)] text-[#E68A82] border-[rgba(201,68,58,0.30)]"
                            }`}
                          >
                            {row.allow ? "Allow" : "Deny"}
                          </button>
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            onClick={() => handleDelete(row)}
                            className="text-dusk hover:text-[#E68A82] transition p-1"
                            aria-label="Delete rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-ink border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-parchment shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] animate-fade-up">
          {toast}
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-dusk uppercase tracking-wide mb-1">
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-dusk mt-1">{children}</div>;
}
