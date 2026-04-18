"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Send,
  Clock,
  Users,
  Inbox,
  Activity as ActivityIcon,
  GitBranch,
} from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import ApprovalPopup from "@/components/ApprovalPopup";
import { useAuth } from "@/lib/AuthContext";
import {
  orchestrateStream,
  submitApproval,
  completeDocRequest,
  resetDemo,
  fetchAgents,
} from "@/lib/api";
import { fetchNotifications } from "@/lib/mocks";
import type { NotificationItem, VerificationStatus } from "@/lib/types";

// ---- Types ----

interface Message {
  id: string;
  sender: string;
  content: string;
  isAgent: boolean;
  timestamp: string;
  type: "user" | "agent" | "system" | "thinking";
}

interface ActivityStep {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  elapsed: string;
  type: "step" | "source" | "chunk" | "approval" | "done";
  agentName?: string;
  documents?: string[];
}

interface AgentReachOut {
  id: string;
  agentName: string;
  topic: string;
  timestamp: string;
  direction: "outgoing" | "incoming";
}

interface PendingApproval {
  approvalId: string;
  requesterName: string;
  targetName: string;
  resource: string;
}

// ---- Constants ----

const QUICK_PROMPTS = [
  { label: "What's on my plate?", desc: "Your tasks" },
  { label: "What's the Stripe API status?", desc: "Cross-team" },
  { label: "Give me a standup update", desc: "Status report" },
];

// Department coloring is intentionally neutral in v1; identity is conveyed
// by the person's name, not by a hue.
const AGENT_AVATAR_CLS =
  "bg-graphite border border-white/[0.08] text-parchment";

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Main Component ----

export default function ChatPage() {
  const { agent: myAgent } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Three-panel state
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [reachOuts, setReachOuts] = useState<AgentReachOut[]>([]);
  const [currentSources, setCurrentSources] = useState<string[]>([]);

  // Panel tabs
  const [leftTab, setLeftTab] = useState<"people" | "inbox">("people");
  const [rightTab, setRightTab] = useState<"reasoning" | "activity">("reasoning");
  const [people, setPeople] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [inbox, setInbox] = useState<NotificationItem[]>([]);

  useEffect(() => {
    fetchAgents()
      .then((agents) => {
        if (Array.isArray(agents)) {
          setPeople(
            agents.map((a: { id: string; name: string; role: string }) => ({
              id: a.id,
              name: a.name,
              role: a.role,
            })),
          );
        }
      })
      .catch(() => setPeople([]));
    fetchNotifications().then(setInbox).catch(() => setInbox([]));
  }, []);

  const endRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
      activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  const now = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const pushMsg = useCallback(
    (sender: string, content: string, type: Message["type"] = "agent") => {
      const msg: Message = {
        id: crypto.randomUUID(),
        sender,
        content,
        isAgent: type !== "user",
        timestamp: now(),
        type,
      };
      setMessages((prev) => [...prev, msg]);
      scrollToBottom();
      return msg.id;
    },
    [scrollToBottom],
  );

  const removeMsg = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const pushActivity = useCallback(
    (label: string, detail: string, type: ActivityStep["type"] = "step", extra?: Partial<ActivityStep>) => {
      const step: ActivityStep = {
        id: crypto.randomUUID(),
        label,
        detail,
        timestamp: now(),
        elapsed: "",
        type,
        ...extra,
      };
      setActivitySteps((prev) => [...prev, step]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ---- Streaming orchestration ----
  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message || loading || !myAgent) return;
    setInput("");
    setLoading(true);

    // Clear activity for new query
    setActivitySteps([]);
    setCurrentSources([]);

    pushMsg("You", message, "user");

    const thinkingId = pushMsg(myAgent.name, "Thinking...", "thinking");
    const startTime = Date.now();

    pushActivity(
      "Received your query",
      message.length > 60 ? message.slice(0, 60) + "..." : message,
      "step",
    );

    let fullResponse = "";

    try {
      await orchestrateStream(myAgent.id, message, sessionId, (event) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        switch (event.type) {
          case "session":
            setSessionId(event.session_id as string);
            break;

          case "step": {
            const step = event.step as { label: string; detail: string };

            // Track sources/agents consulted
            const consultMatch = step.label?.match(/Consulting (.+)\.\.\./);
            if (consultMatch) {
              const names = consultMatch[1].split(", ");
              names.forEach((name) => {
                setReachOuts((prev) => {
                  const exists = prev.some(
                    (r) => r.agentName === name && r.topic === message.slice(0, 50),
                  );
                  if (exists) return prev;
                  return [
                    {
                      id: crypto.randomUUID(),
                      agentName: name,
                      topic: message.length > 50 ? message.slice(0, 50) + "..." : message,
                      timestamp: now(),
                      direction: "outgoing" as const,
                    },
                    ...prev,
                  ];
                });
              });
            }

            pushActivity(step.label, step.detail || "", "step", {
              elapsed: `+${elapsed}s`,
            });
            break;
          }

          case "sources":
            setCurrentSources(event.sources as string[]);
            (event.sources as string[]).forEach((src) => {
              pushActivity(`Source: ${src}`, "", "source", {
                elapsed: `+${elapsed}s`,
                agentName: src,
              });
            });
            break;

          case "chunk":
            // Remove thinking, build response
            removeMsg(thinkingId);
            fullResponse += event.text as string;
            setMessages((prev) => {
              const existing = prev.find(
                (m) => m.id === "streaming-response",
              );
              if (existing) {
                return prev.map((m) =>
                  m.id === "streaming-response"
                    ? { ...m, content: fullResponse }
                    : m,
                );
              }
              return [
                ...prev,
                {
                  id: "streaming-response",
                  sender: myAgent.name,
                  content: fullResponse,
                  isAgent: true,
                  timestamp: now(),
                  type: "agent" as const,
                },
              ];
            });
            scrollToBottom();
            break;

          case "approval":
            removeMsg(thinkingId);
            pushActivity(
              "Approval required",
              `${event.target_name} needs to approve`,
              "approval",
              { elapsed: `+${elapsed}s` },
            );
            setApproval({
              approvalId: event.approval_id as string,
              requesterName: myAgent.name,
              targetName: event.target_name as string,
              resource: message,
            });
            pushMsg(
              myAgent.name,
              `This requires approval from ${event.target_name}. I've sent the request.`,
              "agent",
            );
            break;

          case "done": {
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            pushActivity("Done", `Total: ${totalTime}s`, "done", {
              elapsed: `${totalTime}s`,
            });
            // Finalize streaming message ID
            setMessages((prev) =>
              prev.map((m) =>
                m.id === "streaming-response"
                  ? { ...m, id: crypto.randomUUID() }
                  : m,
              ),
            );
            break;
          }
        }
      });
    } catch {
      removeMsg(thinkingId);
      pushMsg(
        "System",
        "Could not reach the backend. Is the API server running?",
        "system",
      );
    } finally {
      setLoading(false);
    }
  };

  // ---- Approval handler ----
  const handleApproval = async (approved: boolean) => {
    if (!approval || !myAgent) return;
    setLoading(true);
    setApproval(null);

    await submitApproval(approval.approvalId, approved);

    if (approved) {
      pushMsg("System", `${approval.targetName} approved`, "system");
      pushActivity("Approved", `${approval.targetName} granted access`, "step");
      await wait(300);
      const thinkId = pushMsg(approval.targetName, "Thinking...", "thinking");
      const res = await completeDocRequest(approval.approvalId);
      removeMsg(thinkId);
      if (res.answer) pushMsg(approval.targetName, res.answer, "agent");
    } else {
      pushMsg("System", `${approval.targetName} denied`, "system");
      pushActivity("Denied", `${approval.targetName} denied the request`, "step");
    }

    setLoading(false);
  };

  const handleReset = async () => {
    await resetDemo();
    setMessages([]);
    setApproval(null);
    setActivitySteps([]);
    setReachOuts([]);
    setCurrentSources([]);
    setSessionId(null);
  };

  // ---- Not logged in ----
  if (!myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-obsidian text-parchment">
        <p className="text-sm text-smoke mb-4">Sign in to chat with your agent</p>
        <Link
          href="/login"
          className="btn btn-primary text-sm px-5 py-2.5"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const agentColor = AGENT_AVATAR_CLS;

  return (
    <div className="flex h-full bg-obsidian text-parchment">
      {/* ======== LEFT PANEL: People / Inbox ======== */}
      <div className="w-64 border-r border-white/[0.06] flex flex-col shrink-0">
        <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
          <div
            role="tablist"
            aria-label="People or inbox"
            className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
          >
            <button
              role="tab"
              aria-selected={leftTab === "people"}
              onClick={() => setLeftTab("people")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition ${
                leftTab === "people"
                  ? "bg-white/[0.08] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              <Users className="w-3 h-3" /> People
            </button>
            <button
              role="tab"
              aria-selected={leftTab === "inbox"}
              onClick={() => setLeftTab("inbox")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition ${
                leftTab === "inbox"
                  ? "bg-white/[0.08] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              <Inbox className="w-3 h-3" />
              Inbox
              {inbox.filter((n) => !n.read).length > 0 && (
                <span className="ml-0.5 text-[9px] bg-claret/20 text-claret border border-claret/30 rounded px-1">
                  {inbox.filter((n) => !n.read).length}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {leftTab === "people" ? (
            people.length === 0 ? (
              <EmptyPanel
                icon={<Users className="w-4 h-4 text-dusk" />}
                label="No teammates surfaced yet"
              />
            ) : (
              <div className="space-y-1">
                {people.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink border border-white/[0.06] hover:border-white/[0.12] transition animate-fade-up"
                  >
                    <div className="w-7 h-7 rounded-full bg-graphite border border-white/[0.08] flex items-center justify-center text-[9px] font-semibold text-parchment shrink-0">
                      {getInitials(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-bone truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-dusk truncate">{p.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : inbox.length === 0 ? (
            <EmptyPanel
              icon={<Inbox className="w-4 h-4 text-dusk" />}
              label="Inbox zero"
            />
          ) : (
            <div className="space-y-1">
              {inbox.map((n) => (
                <InboxRow key={n.id} item={n} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ======== CENTER: Chat ======== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-white/[0.06] px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full ${agentColor} flex items-center justify-center text-[10px] font-semibold`}
            >
              {getInitials(myAgent.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-medium text-bone">
                  {myAgent.name}&apos;s agent
                </h1>
                <span className="flex items-center gap-1 text-[10px] text-[#88D3A4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3FA46A]" />
                  Active
                </span>
              </div>
              <p className="text-[11px] text-smoke">{myAgent.role}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-smoke hover:text-parchment px-2.5 py-1 rounded-md hover:bg-white/[0.04] transition"
          >
            Clear
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-dusk">
              <div
                className={`w-12 h-12 rounded-2xl ${agentColor} flex items-center justify-center text-base font-semibold mb-4`}
              >
                {getInitials(myAgent.name)}
              </div>
              <p className="text-sm text-parchment mb-1">Your personal agent</p>
              <p className="text-xs text-smoke max-w-xs text-center">
                Ask anything — it knows your tasks and meetings, and reaches out to other agents when needed.
              </p>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.type === "system") {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink/80 border border-white/[0.06]">
                    <span className="w-1.5 h-1.5 rounded-full bg-claret" />
                    <span className="text-[11px] text-parchment">{msg.content}</span>
                  </div>
                </div>
              );
            }
            if (msg.type === "thinking") {
              return (
                <div key={msg.id} className="flex justify-start mb-3">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-graphite/80">
                    <div className="text-[11px] font-medium mb-1 text-parchment">{msg.sender}</div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-smoke rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-smoke rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-smoke rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <ChatMessage
                key={msg.id}
                sender={msg.sender}
                content={msg.content}
                isAgent={msg.isAgent}
                timestamp={msg.timestamp}
              />
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Quick prompts + Input */}
        <div className="border-t border-white/[0.06] p-4 shrink-0">
          {messages.length === 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  onClick={() => handleSend(prompt.label)}
                  disabled={loading}
                  className="flex flex-col items-start text-left bg-ink hover:bg-graphite border border-white/[0.06] hover:border-white/[0.12] px-3 py-2 rounded-xl whitespace-nowrap transition disabled:opacity-40 min-w-0 press-scale"
                >
                  <span className="text-xs text-parchment">{prompt.label}</span>
                  <span className="text-[10px] text-smoke">{prompt.desc}</span>
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your agent anything…"
              disabled={loading}
              className="flex-1 bg-ink border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-parchment input-focus-glow transition disabled:opacity-50 placeholder:text-dusk"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn btn-primary text-sm px-4 py-2.5 disabled:!bg-graphite disabled:!text-dusk"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-bone/30 border-t-bone rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ======== RIGHT PANEL: Reasoning / Activity ======== */}
      <div className="w-72 border-l border-white/[0.06] flex flex-col shrink-0">
        <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
          <div
            role="tablist"
            aria-label="Reasoning or activity"
            className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
          >
            <button
              role="tab"
              aria-selected={rightTab === "reasoning"}
              onClick={() => setRightTab("reasoning")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition ${
                rightTab === "reasoning"
                  ? "bg-white/[0.08] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              <GitBranch className="w-3 h-3" /> Reasoning
              {activitySteps.length > 0 && (
                <span className="text-[9px] text-dusk font-mono ml-0.5">
                  {activitySteps.filter((s) => s.type === "step").length}
                </span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={rightTab === "activity"}
              onClick={() => setRightTab("activity")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition ${
                rightTab === "activity"
                  ? "bg-white/[0.08] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              <ActivityIcon className="w-3 h-3" /> Activity
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {rightTab === "activity" ? (
            inbox.length === 0 ? (
              <EmptyPanel
                icon={<ActivityIcon className="w-4 h-4 text-dusk" />}
                label="Nothing surfaced yet"
              />
            ) : (
              <div className="space-y-2">
                {inbox.map((n) => (
                  <ActivityFeedRow key={n.id} item={n} />
                ))}
              </div>
            )
          ) : activitySteps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-ink border border-white/[0.06] flex items-center justify-center mb-3">
                <Clock className="w-4 h-4 text-dusk" />
              </div>
              <p className="text-[11px] text-dusk leading-relaxed">
                When you ask a question, you&apos;ll see exactly what your agent does behind the scenes
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {activitySteps.map((step, i) => {
                const isLast = i === activitySteps.length - 1;
                const dotColor =
                  step.type === "done"
                    ? "bg-[#3FA46A]"
                    : step.type === "source"
                      ? "bg-claret"
                      : step.type === "approval"
                        ? "bg-[#C98A2B]"
                        : "bg-smoke";

                return (
                  <div key={step.id} className="flex gap-3 animate-fade-up">
                    {/* Timeline */}
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 shrink-0`} />
                      {!isLast && (
                        <div className="w-px flex-1 bg-white/[0.06] my-1" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-4 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-smoke font-mono">
                          {step.elapsed}
                        </span>
                        <span className="text-[10px] text-dusk font-mono">
                          {step.timestamp}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-parchment mt-0.5">
                        {step.label}
                      </p>
                      {step.detail && (
                        <p className="text-[11px] text-smoke mt-0.5">
                          {step.detail}
                        </p>
                      )}
                      {step.agentName && step.type === "source" && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded bg-oxblood/15 text-claret border border-oxblood/30">
                          {step.agentName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={activityEndRef} />
            </div>
          )}
        </div>

        {/* Bottom stats — only in Reasoning tab */}
        {rightTab === "reasoning" && activitySteps.some((s) => s.type === "done") && (
          <div className="border-t border-white/[0.06] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-dusk uppercase tracking-widest">Total time</div>
                <div className="text-sm font-semibold text-bone mt-0.5">
                  {activitySteps.find((s) => s.type === "done")?.elapsed || "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-dusk uppercase tracking-widest">Sources</div>
                <div className="flex items-center gap-1 mt-1">
                  {currentSources.length > 0
                    ? currentSources.map((src) => (
                        <span
                          key={src}
                          className="w-6 h-6 rounded-full bg-graphite border border-white/[0.08] flex items-center justify-center text-[7px] font-semibold text-parchment"
                          title={src}
                        >
                          {getInitials(src)}
                        </span>
                      ))
                    : <span className="text-xs text-dusk">—</span>
                  }
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Approval popup */}
      {approval && (
        <ApprovalPopup
          requesterName={approval.requesterName}
          action="share a document"
          resource={approval.resource}
          description={`${approval.requesterName}'s agent is requesting files from ${approval.targetName}. This requires human approval before any data is shared.`}
          onApprove={() => handleApproval(true)}
          onDeny={() => handleApproval(false)}
        />
      )}
    </div>
  );
}

function EmptyPanel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center py-6">
      <div className="w-10 h-10 rounded-xl bg-ink border border-white/[0.06] flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-[11px] text-dusk leading-relaxed">{label}</p>
    </div>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const styles: Record<VerificationStatus, string> = {
    verified: "bg-[rgba(63,164,106,0.12)] text-[#88D3A4] border-[rgba(63,164,106,0.32)]",
    inferred: "bg-[rgba(201,138,43,0.10)] text-[#E6BA75] border-[rgba(201,138,43,0.28)]",
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

function InboxRow({ item }: { item: NotificationItem }) {
  return (
    <div
      className={`px-3 py-2.5 rounded-lg border transition animate-fade-up ${
        item.read
          ? "bg-ink border-white/[0.06]"
          : "bg-ink border-white/[0.12]"
      }`}
    >
      <div className="flex items-start gap-2">
        {!item.read && (
          <span className="w-1.5 h-1.5 rounded-full bg-claret mt-1.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-bone">{item.action}</span>
            <VerificationBadge status={item.verification} />
          </div>
          <p className="text-[11px] text-smoke mt-0.5 line-clamp-2">
            {item.change_summary}
          </p>
          {item.actor && (
            <p className="text-[10px] text-dusk mt-0.5 truncate">{item.actor}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityFeedRow({ item }: { item: NotificationItem }) {
  return (
    <div className="flex gap-3 animate-fade-up">
      <div className="flex flex-col items-center pt-1">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            item.verification === "verified"
              ? "bg-[#3FA46A]"
              : item.verification === "inferred"
                ? "bg-[#C98A2B]"
                : "bg-smoke"
          }`}
        />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-parchment">
            {item.action}
          </span>
          <VerificationBadge status={item.verification} />
        </div>
        <p className="text-[11px] text-smoke mt-0.5">{item.change_summary}</p>
        {item.actor && (
          <p className="text-[10px] text-dusk mt-0.5">{item.actor}</p>
        )}
      </div>
    </div>
  );
}
