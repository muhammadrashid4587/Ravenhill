"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { orchestrateStream, resetDemo, secondHopStream, completeDocRequest } from "@/lib/api";

const COO_AGENT_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_USER_KEY = "ravenhill_demo_user";

interface DemoUser {
  name: string;
  company: string;
}

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  chunks?: string[];
  sources?: string[];
  secondHopAvailable?: boolean;
  secondHopHint?: string;
  secondHopAgentId?: string;
  streaming?: boolean;
  approvalId?: string;
  approvalTarget?: string;
  error?: boolean;
}

const SUGGESTIONS = [
  {
    text: "Are we on track for the marketplace redesign?",
    label: "Project Status",
  },
  {
    text: "What's blocking the API dependency?",
    label: "Blocker Deep Dive",
  },
  {
    text: "Ask ops to share the vendor contract with engineering",
    label: "Document Request",
  },
];

/* ============================================================
   Ambient Background — reusable across login + chat
   ============================================================ */
function AmbientBackground() {
  return (
    <div className="ambient-bg">
      <div className="ambient-orb ambient-orb--purple" />
      <div className="ambient-orb ambient-orb--pink" />
      <div className="ambient-orb ambient-orb--indigo" />
    </div>
  );
}

/* ============================================================
   Login Gate — dissolves out on submit
   ============================================================ */
function LoginGate({ onLogin }: { onLogin: (user: DemoUser) => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [dissolving, setDissolving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const user = { name: name.trim(), company: company.trim() || "Acme Co" };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
    setDissolving(true);
    setTimeout(() => onLogin(user), 450);
  };

  return (
    <div className={`flex flex-col h-screen items-center justify-center relative z-10 ${
      dissolving ? "animate-dissolve-out" : ""
    }`}>
      <div className="w-full max-w-sm px-6">
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
            <path d="M13 3L4 14h7v7l9-11h-7V3z" fill="url(#bolt-grad)" />
            <defs>
              <linearGradient id="bolt-grad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                <stop stopColor="#a855f7" />
                <stop offset="1" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            RavenHill
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[0.7rem] font-medium uppercase tracking-[0.06em] block mb-1.5"
                   style={{ color: "var(--text-secondary)" }}>
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Riley Chen"
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition placeholder:opacity-50"
              style={{
                background: "var(--bg-interactive)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(236, 72, 153, 0.3)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--glow-pink), 0 0 20px var(--glow-purple)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
          <div>
            <label className="text-[0.7rem] font-medium uppercase tracking-[0.06em] block mb-1.5"
                   style={{ color: "var(--text-secondary)" }}>
              Company
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Co"
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition placeholder:opacity-50"
              style={{
                background: "var(--bg-interactive)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(236, 72, 153, 0.3)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--glow-pink), 0 0 20px var(--glow-purple)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-3 rounded-xl font-medium text-sm text-white transition-all active:scale-[0.96] disabled:opacity-30 disabled:cursor-not-allowed mt-2"
            style={{
              background: name.trim() ? "var(--gradient-hot)" : "var(--bg-interactive)",
              boxShadow: name.trim() ? "0 0 24px var(--glow-pink)" : "none",
            }}
          >
            Start Demo
          </button>
        </form>

        <p className="text-[11px] text-center mt-6" style={{ color: "var(--text-tertiary)" }}>
          This is a live demo. No data is stored.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Main Demo Page
   ============================================================ */
export default function DemoPage() {
  const [demoUser, setDemoUser] = useState<DemoUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [prevStatusText, setPrevStatusText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);

  // Check localStorage for existing demo user
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEMO_USER_KEY);
      if (stored) setDemoUser(JSON.parse(stored));
    } catch { /* ignore */ }
    setAuthChecked(true);
  }, []);

  // Smooth auto-scroll with RAF — only if user is near bottom
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (isNearBottomRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    });
  }, []);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 150;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // WebSocket: listen for approval resolutions
  useEffect(() => {
    if (!demoUser) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ||
      "localhost:8000";
    const url = `${protocol}//${host}/api/approvals/ws/${COO_AGENT_ID}`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(url);

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "context_request") {
            const fromAgent = data.from_agent || "The approver";
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "agent" as const,
                content: `${fromAgent} wants a bit more context before approving — why do you need this document? You can reply and I'll pass it along.`,
              },
            ]);
          }
          if (data.type === "approval_resolved" && data.approval_id) {
            const approved = data.status === "approved";
            try {
              const result = await completeDocRequest(data.approval_id);
              const completionText =
                result.answer ||
                (approved
                  ? "Document has been approved and shared."
                  : "The document request was denied.");

              setMessages((prev) => {
                const hasApproval = prev.some(
                  (m) => m.approvalId === data.approval_id
                );
                if (!hasApproval) return prev;

                return [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "agent" as const,
                    content: completionText,
                    sources: result.sources || [],
                  },
                ];
              });
            } catch {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "agent" as const,
                  content: approved
                    ? "Good news — the document has been approved and shared with you."
                    : "The request was declined. Want me to follow up with them for context on why?",
                },
              ]);
            }
          }
        } catch {
          /* ignore malformed messages */
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws?.close();
      };

      const pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
      }, 30000);

      ws.addEventListener("close", () => clearInterval(pingInterval));
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [demoUser]);

  const showStatus = useCallback((text: string) => {
    setPrevStatusText(statusText);
    setStatusText(text);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => {
      setPrevStatusText("");
      setStatusText("");
    }, 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    setMessages((prev) => [...prev, userMsg]);

    const agentMsgId = crypto.randomUUID();
    const agentMsg: Message = {
      id: agentMsgId,
      role: "agent",
      content: "",
      chunks: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, agentMsg]);

    try {
      await orchestrateStream(COO_AGENT_ID, message, sessionId, (event) => {
        const type = event.type as string;

        if (type === "session") {
          const sid = event.session_id as string;
          setSessionId(sid);
        }

        if (type === "step") {
          const step = event.step as { label: string; detail?: string };
          showStatus(step.label);
        }

        if (type === "chunk") {
          const chunkText = event.text as string;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? {
                    ...m,
                    content: m.content + chunkText,
                    chunks: [...(m.chunks || []), chunkText],
                  }
                : m
            )
          );
        }

        if (type === "sources") {
          const sources = event.sources as string[];
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId ? { ...m, sources } : m
            )
          );
        }

        if (type === "second_hop") {
          const hint = event.hint as string;
          const agentId = event.agent_id as string;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? {
                    ...m,
                    secondHopAvailable: true,
                    secondHopHint: hint,
                    secondHopAgentId: agentId,
                  }
                : m
            )
          );
        }

        if (type === "approval") {
          const approvalId = event.approval_id as string;
          const targetName = event.target_name as string;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? {
                    ...m,
                    content:
                      m.content ||
                      `I've reached out to ${targetName || "the team"} to get that document for you. They'll need to approve the share — I'll let you know as soon as they respond.`,
                    approvalId,
                    approvalTarget: targetName,
                  }
                : m
            )
          );
        }

        if (type === "error") {
          const errorMsg = event.message as string;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? { ...m, content: errorMsg, error: true, streaming: false }
                : m
            )
          );
        }

        if (type === "done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId ? { ...m, streaming: false } : m
            )
          );
        }
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                content:
                  "Unable to connect to the server. Please check your connection and try again.",
                streaming: false,
                error: true,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSecondHop = async (referencedAgentId: string, hint: string) => {
    if (loading) return;
    setLoading(true);

    const followUp = hint.replace(/^Want me to /, "Yes, ").replace(/\?$/, ".");
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const originalQuestion = lastUserMsg?.content ?? followUp;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: followUp,
    };
    setMessages((prev) => [...prev, userMsg]);

    const agentMsgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, role: "agent", content: "", chunks: [], streaming: true },
    ]);

    try {
      await secondHopStream(
        COO_AGENT_ID,
        referencedAgentId,
        originalQuestion,
        followUp,
        sessionId,
        (event) => {
          const type = event.type as string;

          if (type === "session") {
            const sid = event.session_id as string;
            setSessionId(sid);
          }

          if (type === "step") {
            const step = event.step as { label: string };
            showStatus(step.label);
          }
          if (type === "chunk") {
            const chunkText = event.text as string;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      content: m.content + chunkText,
                      chunks: [...(m.chunks || []), chunkText],
                    }
                  : m
              )
            );
          }
          if (type === "sources") {
            const sources = event.sources as string[];
            setMessages((prev) =>
              prev.map((m) => (m.id === agentMsgId ? { ...m, sources } : m))
            );
          }
          if (type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, streaming: false } : m
              )
            );
          }
        }
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                content: "Unable to reach that team member right now. Please try again.",
                streaming: false,
                error: true,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    await resetDemo();
    setMessages([]);
    setSessionId(null);
    setStatusText("");
    setPrevStatusText("");
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(DEMO_USER_KEY);
    setDemoUser(null);
    setMessages([]);
    setSessionId(null);
  };

  const showSuggestions = messages.length === 0 && !loading;

  // Show nothing until auth check completes (prevents flash)
  if (!authChecked) return null;

  // Show login gate if no demo user
  if (!demoUser) {
    return (
      <div style={{ background: "var(--bg-void)" }} className="h-screen">
        <AmbientBackground />
        <LoginGate onLogin={setDemoUser} />
      </div>
    );
  }

  const firstName = demoUser.name.split(" ")[0];

  return (
    <div className="flex flex-col h-screen relative" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      <AmbientBackground />

      {/* Main content — above ambient background */}
      <div className="flex flex-col h-screen relative z-10 animate-materialize-in">
        {/* Header */}
        <header className="px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M13 3L4 14h7v7l9-11h-7V3z" fill="url(#bolt-hdr)" />
              <defs>
                <linearGradient id="bolt-hdr" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#a855f7" />
                  <stop offset="1" stopColor="#ec4899" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-secondary)" }}>
              RavenHill
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Status text with crossfade */}
            <div className="relative h-4 flex items-center">
              {prevStatusText && (
                <span className="absolute right-0 text-[11px] animate-crossfade-out whitespace-nowrap"
                      style={{ color: "var(--text-tertiary)" }}>
                  {prevStatusText}
                </span>
              )}
              {statusText && (
                <span key={statusText} className="text-[11px] animate-crossfade-in whitespace-nowrap"
                      style={{ color: "var(--text-tertiary)" }}>
                  {statusText}
                </span>
              )}
            </div>
            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {demoUser.name}
            </span>
            <button
              onClick={handleReset}
              className="text-xs transition-colors hover:text-[var(--accent-pink)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              Reset
            </button>
            <button
              onClick={handleLogout}
              className="text-xs transition-colors hover:text-[var(--accent-pink)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              Exit
            </button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 md:px-0"
        >
          <div className="max-w-2xl mx-auto py-6 space-y-5">
            {/* Empty state with greeting + suggestions */}
            {showSuggestions && (
              <div className="flex flex-col items-center justify-center pt-28 animate-fade-up">
                <p className="text-2xl font-semibold tracking-tight mb-1 gradient-text">
                  Hi {firstName}
                </p>
                <p className="text-sm mb-10" style={{ color: "var(--text-secondary)" }}>
                  Ask your agent anything about the company
                </p>
                <div className="grid gap-3 w-full max-w-md">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => handleSend(s.text)}
                      className="text-left glass-card gradient-border rounded-xl px-4 py-3.5 transition-all duration-200 group hover:-translate-y-[3px]"
                      style={{ cursor: "pointer" }}
                    >
                      <span className="text-sm transition-colors group-hover:text-white"
                            style={{ color: "var(--text-primary)" }}>
                        {s.text}
                      </span>
                      <span className="block text-[0.7rem] font-medium uppercase tracking-[0.06em] mt-1"
                            style={{ color: "var(--text-tertiary)" }}>
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => {
              const isUser = msg.role === "user";

              return (
                <div key={msg.id} className={isUser ? "animate-slide-in-right" : "animate-fade-up"}>
                  {isUser ? (
                    /* User message — right-aligned, gradient glow */
                    <div className="flex justify-end">
                      <div
                        className="rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]"
                        style={{
                          background: "var(--gradient-hot)",
                          boxShadow: "4px 0 24px var(--glow-pink)",
                        }}
                      >
                        <p className="text-sm leading-relaxed text-white">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    /* Agent message — left-aligned */
                    <div className="flex justify-start">
                      <div className="max-w-[85%]">
                        {/* Typing indicator — shimmer wave */}
                        {msg.streaming && !msg.content ? (
                          <div className="flex items-center gap-3 py-2">
                            <div className="flex gap-1.5">
                              <span className="w-[5px] h-[5px] rounded-full shimmer-dot-1"
                                    style={{ backgroundColor: "var(--accent-pink)" }} />
                              <span className="w-[5px] h-[5px] rounded-full shimmer-dot-2"
                                    style={{ backgroundColor: "var(--accent-pink)" }} />
                              <span className="w-[5px] h-[5px] rounded-full shimmer-dot-3"
                                    style={{ backgroundColor: "var(--accent-pink)" }} />
                            </div>
                            {statusText && (
                              <span className="text-[11px] animate-crossfade-in"
                                    style={{ color: "var(--text-tertiary)" }}>
                                {statusText}
                              </span>
                            )}
                          </div>
                        ) : (
                          /* Streaming chunks with per-chunk fade, or static content */
                          <p className={`text-sm leading-[1.65] whitespace-pre-wrap ${
                            msg.error ? "" : ""
                          }`} style={{ color: msg.error ? "var(--danger)" : "var(--text-primary)" }}>
                            {msg.streaming && msg.chunks && msg.chunks.length > 0
                              ? msg.chunks.map((chunk, i) => (
                                  <span key={i} className={i === msg.chunks!.length - 1 ? "animate-chunk-fade" : ""}>
                                    {chunk}
                                  </span>
                                ))
                              : msg.content
                            }
                          </p>
                        )}

                        {/* Source attribution pills — staggered entrance */}
                        {msg.sources && msg.sources.length > 0 && !msg.streaming && (
                          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                            <span className="text-[0.65rem] font-medium uppercase tracking-[0.06em]"
                                  style={{ color: "var(--text-tertiary)" }}>
                              Sources
                            </span>
                            {msg.sources.map((source, i) => (
                              <span
                                key={i}
                                className="glass-card gradient-border text-[11px] px-2.5 py-0.5 rounded-full animate-pill-enter transition-all hover:-translate-y-px"
                                style={{
                                  color: "var(--text-secondary)",
                                  animationDelay: `${i * 80}ms`,
                                }}
                              >
                                {source}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Approval toast */}
                        {msg.approvalId && !msg.streaming && (
                          <div className="mt-2.5 text-[11px] flex items-center gap-1.5 animate-fade-up"
                               style={{ color: "var(--warning)", opacity: 0.8 }}>
                            <span className="w-1.5 h-1.5 rounded-full animate-ambient-breathe"
                                  style={{ backgroundColor: "var(--warning)" }} />
                            Approval request sent to {msg.approvalTarget || "Operations"}
                          </div>
                        )}

                        {/* Second-hop suggestion — gradient card */}
                        {msg.secondHopAvailable &&
                          msg.secondHopHint &&
                          !msg.streaming && (
                            <button
                              onClick={() =>
                                handleSecondHop(
                                  msg.secondHopAgentId || "",
                                  msg.secondHopHint || ""
                                )
                              }
                              disabled={loading}
                              className="mt-3 glass-card gradient-border rounded-xl px-4 py-2.5 text-sm transition-all duration-200 flex items-center gap-2 disabled:opacity-30 hover:-translate-y-[2px] animate-fade-up"
                              style={{
                                animationDelay: `${((msg.sources?.length || 0) * 80) + 400}ms`,
                                color: "var(--text-primary)",
                              }}
                            >
                              <span className="animate-ambient-breathe" style={{ color: "var(--accent-pink)" }}>→</span>
                              {msg.secondHopHint}
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input bar */}
        <div className="shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="max-w-2xl mx-auto px-4 py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-3"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your agent anything about the company..."
                disabled={loading}
                className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none transition-all duration-200 disabled:opacity-40"
                style={{
                  background: "var(--bg-interactive)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(236, 72, 153, 0.3)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px var(--glow-pink), 0 0 20px var(--glow-purple)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-5 py-3 rounded-xl font-medium text-sm text-white transition-all duration-200 active:scale-[0.96] disabled:opacity-20 disabled:cursor-not-allowed"
                style={{
                  background: (!loading && input.trim()) ? "var(--gradient-hot)" : "var(--bg-interactive)",
                  boxShadow: (!loading && input.trim()) ? "0 0 20px var(--glow-pink)" : "none",
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
