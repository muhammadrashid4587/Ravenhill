"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Send, Clock, FileText, ArrowRight } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import ApprovalPopup from "@/components/ApprovalPopup";
import { useAgent } from "@/lib/AgentContext";
import {
  orchestrateStream,
  submitApproval,
  completeDocRequest,
  resetDemo,
} from "@/lib/api";

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

const DEPT_COLORS: Record<string, string> = {
  Sales: "bg-blue-500",
  Finance: "bg-purple-500",
  Marketing: "bg-emerald-500",
  Engineering: "bg-orange-500",
  Product: "bg-pink-500",
  Operations: "bg-cyan-500",
  Executive: "bg-amber-500",
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Main Component ----

export default function ChatPage() {
  const { myAgent } = useAgent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Three-panel state
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [reachOuts, setReachOuts] = useState<AgentReachOut[]>([]);
  const [currentSources, setCurrentSources] = useState<string[]>([]);

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
      <div className="flex flex-col items-center justify-center h-full bg-[#09090b] text-white">
        <p className="text-sm text-zinc-500 mb-4">Sign in to chat with your agent</p>
        <Link
          href="/login"
          className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition press-scale"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const agentColor = DEPT_COLORS[myAgent.departments?.[0]] ?? "bg-zinc-600";

  return (
    <div className="flex h-full bg-[#09090b] text-white">
      {/* ======== LEFT PANEL: Agent Conversations ======== */}
      <div className="w-64 border-r border-white/[0.06] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Agent Conversations
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {reachOuts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface border border-white/[0.06] flex items-center justify-center mb-3">
                <ArrowRight className="w-4 h-4 text-zinc-600" />
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                When your agent reaches out to others, conversations will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {reachOuts.map((r) => (
                <div
                  key={r.id}
                  className="px-3 py-2.5 rounded-lg bg-surface border border-white/[0.06] hover:border-white/[0.12] transition animate-fade-up"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[8px] font-bold text-blue-400">
                      {getInitials(r.agentName)}
                    </div>
                    <span className="text-xs font-medium text-zinc-200 truncate">
                      {r.agentName}
                    </span>
                    <span className="text-[10px] text-zinc-600 ml-auto shrink-0">
                      {r.timestamp}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-8">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {r.direction === "outgoing" ? `You → ${r.agentName.split(" ")[0]}` : `${r.agentName.split(" ")[0]} → You`}
                    </span>
                    <span className="text-[10px] text-zinc-600 truncate">
                      {r.topic}
                    </span>
                  </div>
                </div>
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
              className={`w-8 h-8 rounded-full ${agentColor} flex items-center justify-center text-[10px] font-bold`}
            >
              {getInitials(myAgent.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold font-display">
                  {myAgent.name}&apos;s Agent
                </h1>
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">{myAgent.role}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-zinc-600 hover:text-zinc-300 px-2.5 py-1 rounded-md hover:bg-white/[0.04] transition"
          >
            Clear
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <div
                className={`w-12 h-12 rounded-2xl ${agentColor} flex items-center justify-center text-base font-bold text-white mb-4`}
              >
                {getInitials(myAgent.name)}
              </div>
              <p className="text-sm mb-1">Your personal agent</p>
              <p className="text-xs text-zinc-600 max-w-xs text-center">
                Ask anything — it knows your tasks and meetings, and reaches out to other agents when needed.
              </p>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.type === "system") {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/80 border border-white/[0.06]">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-[11px] text-zinc-400">{msg.content}</span>
                  </div>
                </div>
              );
            }
            if (msg.type === "thinking") {
              return (
                <div key={msg.id} className="flex justify-start mb-3">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-elevated/80">
                    <div className="text-[11px] font-medium mb-1 text-zinc-400">{msg.sender}</div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
                  className="flex flex-col items-start text-left bg-surface hover:bg-elevated border border-white/[0.06] hover:border-white/[0.12] px-3 py-2 rounded-xl whitespace-nowrap transition disabled:opacity-40 min-w-0 press-scale"
                >
                  <span className="text-xs text-white">{prompt.label}</span>
                  <span className="text-[10px] text-zinc-500">{prompt.desc}</span>
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
              placeholder={`Ask your agent anything...`}
              disabled={loading}
              className="flex-1 bg-surface border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition disabled:opacity-50 placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-elevated disabled:text-zinc-600 px-4 py-2.5 rounded-xl font-medium text-sm transition flex items-center gap-2 press-scale"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ======== RIGHT PANEL: Agent Activity ======== */}
      <div className="w-72 border-l border-white/[0.06] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Agent Activity
          </h2>
          {activitySteps.length > 0 && (
            <span className="text-[10px] text-zinc-600">
              {activitySteps.filter((s) => s.type === "step").length} steps
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {activitySteps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface border border-white/[0.06] flex items-center justify-center mb-3">
                <Clock className="w-4 h-4 text-zinc-600" />
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                When you ask a question, you&apos;ll see exactly what your agent does behind the scenes
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {activitySteps.map((step, i) => {
                const isLast = i === activitySteps.length - 1;
                const dotColor =
                  step.type === "done"
                    ? "bg-emerald-500"
                    : step.type === "source"
                      ? "bg-blue-500"
                      : step.type === "approval"
                        ? "bg-amber-500"
                        : "bg-zinc-500";

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
                        <span className="text-[10px] text-zinc-500">
                          {step.elapsed}
                        </span>
                        <span className="text-[10px] text-zinc-700">
                          {step.timestamp}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-zinc-300 mt-0.5">
                        {step.label}
                      </p>
                      {step.detail && (
                        <p className="text-[11px] text-zinc-600 mt-0.5">
                          {step.detail}
                        </p>
                      )}
                      {step.agentName && step.type === "source" && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
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

        {/* Bottom stats */}
        {activitySteps.some((s) => s.type === "done") && (
          <div className="border-t border-white/[0.06] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-zinc-600">Total time</div>
                <div className="text-sm font-semibold text-white">
                  {activitySteps.find((s) => s.type === "done")?.elapsed || "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-zinc-600">Sources</div>
                <div className="flex items-center gap-1 mt-0.5">
                  {currentSources.length > 0
                    ? currentSources.map((src) => (
                        <span
                          key={src}
                          className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[7px] font-bold text-blue-400"
                          title={src}
                        >
                          {getInitials(src)}
                        </span>
                      ))
                    : <span className="text-xs text-zinc-600">—</span>
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
