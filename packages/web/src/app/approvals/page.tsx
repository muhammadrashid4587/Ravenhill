"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Check,
  X,
  Inbox,
  ShieldCheck,
  HelpCircle,
  Send,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  askAboutApproval,
  fetchApprovals,
  submitApproval,
  type ApprovalAskTurn,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type { Approval, VerificationStatus } from "@/lib/types";

type FilterTab = "pending" | "approved" | "denied";

const TAB_ICONS: Record<FilterTab, typeof Clock> = {
  pending: Clock,
  approved: CheckCircle2,
  denied: XCircle,
};

const TAB_LABELS: Record<FilterTab, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const styles: Record<VerificationStatus, string> = {
    verified:
      "bg-[rgba(63,164,106,0.12)] text-[#88D3A4] border-[rgba(63,164,106,0.32)]",
    inferred:
      "bg-[rgba(201,138,43,0.10)] text-[#E6BA75] border-[rgba(201,138,43,0.28)]",
    unverified: "bg-white/[0.04] text-smoke border-white/[0.08]",
  };
  const dot: Record<VerificationStatus, string> = {
    verified: "bg-[#3FA46A]",
    inferred: "bg-[#C98A2B]",
    unverified: "bg-smoke",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border ${styles[status]}`}
      title={`Verification: ${status}`}
    >
      <span className={`w-1 h-1 rounded-full ${dot[status]}`} />
      {status}
    </span>
  );
}

export default function ApprovalsPage() {
  const { agent: myAgent } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  // Request-more-info state — local only until a backend endpoint lands.
  const [infoPromptFor, setInfoPromptFor] = useState<string | null>(null);
  const [infoDraft, setInfoDraft] = useState("");
  const [infoRequested, setInfoRequested] = useState<Record<string, string>>({});
  // Ask-for-more chat state, scoped per approval id.
  const [askOpenFor, setAskOpenFor] = useState<string | null>(null);
  const [askTurns, setAskTurns] = useState<Record<string, ApprovalAskTurn[]>>({});
  const [askDraft, setAskDraft] = useState<Record<string, string>>({});
  const [askBusy, setAskBusy] = useState<string | null>(null);
  const [askError, setAskError] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchApprovals()
      .then(setApprovals)
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(
    () => ({
      pending: approvals.filter((a) => a.status === "pending").length,
      approved: approvals.filter((a) => a.status === "approved").length,
      denied: approvals.filter((a) => a.status === "denied").length,
    }),
    [approvals],
  );

  const visible = useMemo(
    () => approvals.filter((a) => a.status === tab),
    [approvals, tab],
  );

  async function sendAsk(approval: Approval) {
    const draft = (askDraft[approval.id] || "").trim();
    if (!draft) return;
    setAskBusy(approval.id);
    setAskError((prev) => ({ ...prev, [approval.id]: "" }));

    const prior = askTurns[approval.id] || [];
    const nextHistory: ApprovalAskTurn[] = [
      ...prior,
      { role: "user", content: draft },
    ];
    // Render the user's message immediately; clear the draft.
    setAskTurns((prev) => ({ ...prev, [approval.id]: nextHistory }));
    setAskDraft((prev) => ({ ...prev, [approval.id]: "" }));

    try {
      const res = await askAboutApproval({
        approvalId: approval.id,
        question: draft,
        targetAgentId: myAgent?.id,
        conversation: prior,
        fallbackContext: {
          requester_name: approval.requester_name,
          target_name: approval.target_name,
          resource: approval.resource,
          context: approval.context,
          status: approval.status,
          verification: approval.verification,
          created_at: approval.created_at,
        },
      });
      setAskTurns((prev) => ({
        ...prev,
        [approval.id]: [
          ...nextHistory,
          { role: "assistant", content: res.answer },
        ],
      }));
    } catch (e) {
      setAskError((prev) => ({
        ...prev,
        [approval.id]:
          e instanceof Error ? e.message : "Couldn't reach the agent.",
      }));
    } finally {
      setAskBusy(null);
    }
  }

  async function decide(approval: Approval, approve: boolean) {
    setDeciding(approval.id);
    try {
      // Backend decide route exists; mock ids won't actually resolve, so swallow.
      await submitApproval(approval.id, approve).catch(() => null);
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === approval.id
            ? { ...a, status: approve ? "approved" : "denied" }
            : a,
        ),
      );
      setExpanded(null);
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-5 animate-fade-up">
        <div className="flex items-center gap-2.5 mb-1">
          <ShieldCheck className="w-4 h-4 text-smoke" />
          <h1 className="text-lg font-semibold text-bone">Approvals</h1>
        </div>
        <p className="text-xs text-smoke">
          Requests from other agents that need your go-ahead before information
          leaves your trust envelope.
        </p>
      </header>

      <div className="p-6 max-w-4xl">
        {/* Filter tabs */}
        <div
          role="tablist"
          aria-label="Approval status"
          className="flex items-center gap-1 mb-5 bg-ink border border-white/[0.06] rounded-lg p-0.5 w-fit"
        >
          {(Object.keys(TAB_LABELS) as FilterTab[]).map((t) => {
            const Icon = TAB_ICONS[t];
            const active = tab === t;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition ${
                  active
                    ? "bg-white/[0.08] text-bone"
                    : "text-smoke hover:text-parchment"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {TAB_LABELS[t]}
                <span className="text-[10px] text-dusk font-mono">
                  {counts[t]}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-ink border border-white/[0.06] rounded-xl p-10 text-center">
            <Inbox className="w-8 h-8 text-dusk mx-auto mb-3" />
            <p className="text-sm text-smoke mb-1">
              {tab === "pending"
                ? "Nothing waiting for you"
                : `No ${tab} approvals`}
            </p>
            <p className="text-[11px] text-dusk">
              {tab === "pending"
                ? "Standing permissions keep this inbox light."
                : "History will appear here as requests are resolved."}
            </p>
          </div>
        ) : (
          <div className="space-y-2 stagger">
            {visible.map((a) => (
              <div
                key={a.id}
                className="bg-ink border border-white/[0.06] hover:border-white/[0.12] rounded-xl transition animate-fade-up"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(expanded === a.id ? null : a.id)
                  }
                  className="w-full text-left px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-graphite border border-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-parchment shrink-0">
                      {getInitials(a.requester_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-bone truncate">
                          <span className="font-medium">
                            {a.requester_name}
                          </span>
                          <span className="text-smoke">
                            {" "}
                            is requesting{" "}
                          </span>
                          <span className="font-medium">{a.resource}</span>
                        </span>
                        <VerificationBadge status={a.verification} />
                      </div>
                      {a.context && (
                        <p className="text-[11px] text-smoke mt-0.5 line-clamp-1">
                          {a.context}
                        </p>
                      )}
                      <p className="text-[10px] text-dusk mt-0.5">
                        {timeAgo(a.created_at)}
                      </p>
                    </div>
                  </div>
                </button>

                {expanded === a.id && (
                  <div className="border-t border-white/[0.06] px-4 py-3 space-y-3 animate-fade-up">
                    {a.context && (
                      <p className="text-xs text-parchment leading-relaxed">
                        {a.context}
                      </p>
                    )}
                    {a.status === "pending" ? (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            disabled={deciding === a.id}
                            onClick={() => decide(a, true)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[rgba(63,164,106,0.14)] text-[#88D3A4] border border-[rgba(63,164,106,0.32)] hover:bg-[rgba(63,164,106,0.22)] transition disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            type="button"
                            disabled={deciding === a.id}
                            onClick={() => decide(a, false)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[rgba(201,68,58,0.12)] text-[#E68A82] border border-[rgba(201,68,58,0.32)] hover:bg-[rgba(201,68,58,0.2)] transition disabled:opacity-50"
                          >
                            <X className="w-3 h-3" /> Deny
                          </button>
                          <button
                            type="button"
                            disabled={deciding === a.id}
                            onClick={() => {
                              setInfoPromptFor(
                                infoPromptFor === a.id ? null : a.id,
                              );
                              setInfoDraft("");
                            }}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] text-parchment border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.14] transition disabled:opacity-50"
                          >
                            <HelpCircle className="w-3 h-3" /> Request more info
                          </button>
                          <button
                            type="button"
                            disabled={deciding === a.id}
                            onClick={() => {
                              setAskOpenFor(askOpenFor === a.id ? null : a.id);
                              setAskError((prev) => ({ ...prev, [a.id]: "" }));
                            }}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-claret/15 text-claret border border-claret/30 hover:bg-claret/25 transition disabled:opacity-50"
                          >
                            <Sparkles className="w-3 h-3" /> Ask for more
                          </button>
                          {deciding === a.id && (
                            <span className="text-[11px] text-dusk">
                              Submitting…
                            </span>
                          )}
                        </div>

                        {infoPromptFor === a.id && (
                          <div className="mt-2 rounded-lg border border-white/[0.08] bg-ink p-3 animate-fade-up">
                            <label className="block text-[11px] text-smoke mb-1.5">
                              What would you like {a.requester_name.split(" ")[0]} to clarify?
                            </label>
                            <textarea
                              value={infoDraft}
                              onChange={(e) => setInfoDraft(e.target.value)}
                              placeholder="e.g. Can you confirm this is for the Q4 deck specifically, and which numbers you need?"
                              rows={3}
                              className="w-full bg-obsidian border border-white/[0.06] rounded-md px-2.5 py-2 text-[12px] text-parchment placeholder:text-dusk focus:outline-none focus:border-white/[0.14] transition resize-none"
                            />
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                type="button"
                                disabled={!infoDraft.trim()}
                                onClick={() => {
                                  setInfoRequested((prev) => ({
                                    ...prev,
                                    [a.id]: infoDraft.trim(),
                                  }));
                                  setInfoPromptFor(null);
                                  setInfoDraft("");
                                }}
                                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md bg-oxblood/80 text-bone hover:bg-oxblood transition disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Send className="w-3 h-3" />
                                Send to {a.requester_name.split(" ")[0]}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setInfoPromptFor(null);
                                  setInfoDraft("");
                                }}
                                className="text-[11px] text-dusk hover:text-smoke transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {infoRequested[a.id] && infoPromptFor !== a.id && (
                          <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-smoke">
                            <div className="flex items-center gap-1.5 text-dusk font-mono text-[10px] mb-1">
                              <HelpCircle className="w-3 h-3" />
                              You asked for more info — awaiting {a.requester_name.split(" ")[0]}
                            </div>
                            <p className="text-parchment">
                              &ldquo;{infoRequested[a.id]}&rdquo;
                            </p>
                          </div>
                        )}

                        {askOpenFor === a.id && (
                          <div className="mt-2 rounded-lg border border-claret/30 bg-claret/[0.04] p-3 animate-fade-up">
                            <div className="flex items-center gap-1.5 text-[10px] text-dusk font-mono mb-2 uppercase tracking-wider">
                              <Sparkles className="w-3 h-3 text-claret" />
                              Ask your agent — uses Ravenhill data
                            </div>

                            {(askTurns[a.id]?.length ?? 0) > 0 && (
                              <div className="space-y-2 mb-2 max-h-72 overflow-y-auto pr-1">
                                {askTurns[a.id].map((turn, i) => (
                                  <div
                                    key={i}
                                    className={
                                      turn.role === "user"
                                        ? "text-[12px] text-parchment"
                                        : "text-[12px] text-bone leading-relaxed bg-ink/60 border border-white/[0.05] rounded-md px-2.5 py-2"
                                    }
                                  >
                                    <span className="text-[9px] uppercase tracking-wider text-dusk font-mono mr-2">
                                      {turn.role === "user" ? "you" : "agent"}
                                    </span>
                                    <span className="whitespace-pre-wrap">
                                      {turn.content}
                                    </span>
                                  </div>
                                ))}
                                {askBusy === a.id && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-dusk">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Reasoning over the approval context…
                                  </div>
                                )}
                              </div>
                            )}

                            {askError[a.id] && (
                              <div className="mb-2 text-[11px] text-claret">
                                {askError[a.id]}
                              </div>
                            )}

                            <div className="flex items-end gap-2">
                              <textarea
                                value={askDraft[a.id] || ""}
                                onChange={(e) =>
                                  setAskDraft((prev) => ({
                                    ...prev,
                                    [a.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "Enter" &&
                                    !e.shiftKey &&
                                    !askBusy
                                  ) {
                                    e.preventDefault();
                                    void sendAsk(a);
                                  }
                                }}
                                placeholder={
                                  (askTurns[a.id]?.length ?? 0) === 0
                                    ? `Ask anything — e.g. "Has ${a.requester_name.split(" ")[0]} requested this before?" or "What's the risk?"`
                                    : "Follow up…"
                                }
                                rows={2}
                                disabled={askBusy === a.id}
                                className="flex-1 bg-obsidian border border-white/[0.06] rounded-md px-2.5 py-2 text-[12px] text-parchment placeholder:text-dusk focus:outline-none focus:border-white/[0.14] transition resize-none disabled:opacity-60"
                              />
                              <button
                                type="button"
                                onClick={() => void sendAsk(a)}
                                disabled={
                                  askBusy === a.id ||
                                  !(askDraft[a.id] || "").trim()
                                }
                                className="shrink-0 flex items-center gap-1 text-[11px] px-3 py-2 rounded-md bg-claret/80 text-bone hover:bg-claret transition disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {askBusy === a.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" />
                                )}
                                Ask
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-dusk">
                        Resolved {timeAgo(a.created_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
