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
  Paperclip,
  Hash,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  X,
  FileText,
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
import {
  fetchNotifications,
  fetchSlackChannels,
  fetchSlackThread,
  sampleAttachment,
  summarizeAttachment,
} from "@/lib/mocks";
import type {
  ChatAttachment,
  FileSummary,
  NotificationItem,
  SlackChannel,
  SlackMessage,
  VerificationStatus,
} from "@/lib/types";

// ---- Types ----

interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionResultItem;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface Message {
  id: string;
  sender: string;
  content: string;
  isAgent: boolean;
  timestamp: string;
  type: "user" | "agent" | "system" | "thinking";
  attachments?: ChatAttachment[];
  channel?: string;
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

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — matches UI affordance
const MAX_ATTACHMENTS_PER_MESSAGE = 4;

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fileToAttachment(file: File): ChatAttachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    url: URL.createObjectURL(file),
    source: "upload",
  };
}

function summaryToMarkdown(summary: FileSummary): string {
  const lines: string[] = [];
  lines.push(`**${summary.title}**`);
  lines.push("");
  lines.push(summary.one_liner);

  if (summary.contributors.length > 0) {
    lines.push("");
    lines.push("**Who did what**");
    for (const c of summary.contributors) {
      lines.push(`• ${c.name} — ${c.did}`);
    }
  }

  if (summary.action_items.length > 0) {
    lines.push("");
    lines.push("**Action items**");
    for (const a of summary.action_items) {
      const due = a.due ? ` (due ${a.due})` : "";
      lines.push(`• ${a.owner}: ${a.task}${due}`);
    }
  }

  if (summary.open_questions && summary.open_questions.length > 0) {
    lines.push("");
    lines.push("**Open questions**");
    for (const q of summary.open_questions) {
      lines.push(`• ${q}`);
    }
  }
  return lines.join("\n");
}

// ---- Main Component ----

export default function ChatPage() {
  const { agent: myAgent } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<unknown>(null);
  const voiceBaseRef = useRef<string>("");
  const [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Pending attachments staged for the next send
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Three-panel state
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [reachOuts, setReachOuts] = useState<AgentReachOut[]>([]);
  const [currentSources, setCurrentSources] = useState<string[]>([]);

  // Panel tabs
  const [leftTab, setLeftTab] = useState<"people" | "inbox" | "slack">("people");
  const [rightTab, setRightTab] = useState<"reasoning" | "activity">("reasoning");
  const [people, setPeople] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [inbox, setInbox] = useState<NotificationItem[]>([]);

  // Slack state
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [activeSlackChannel, setActiveSlackChannel] = useState<SlackChannel | null>(null);
  const [slackThread, setSlackThread] = useState<SlackMessage[]>([]);
  const [slackLoading, setSlackLoading] = useState(false);

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
    fetchSlackChannels().then(setSlackChannels).catch(() => setSlackChannels([]));
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
    (
      sender: string,
      content: string,
      type: Message["type"] = "agent",
      extras?: Partial<Pick<Message, "attachments" | "channel">>,
    ) => {
      const msg: Message = {
        id: crypto.randomUUID(),
        sender,
        content,
        isAgent: type !== "user",
        timestamp: now(),
        type,
        ...extras,
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

  // ---- Slack handlers ----
  const openSlackChannel = async (channel: SlackChannel) => {
    setActiveSlackChannel(channel);
    setSlackLoading(true);
    try {
      const thread = await fetchSlackThread(channel.id);
      setSlackThread(thread);
    } finally {
      setSlackLoading(false);
    }
  };

  const closeSlackChannel = () => {
    setActiveSlackChannel(null);
    setSlackThread([]);
  };

  // ---- File upload handlers ----
  const handleFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachmentError(null);

    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
    const picked = Array.from(files).slice(0, remaining);
    const valid: ChatAttachment[] = [];

    for (const f of picked) {
      if (f.size > MAX_UPLOAD_BYTES) {
        setAttachmentError(`${f.name} is larger than 10 MB`);
        continue;
      }
      valid.push(fileToAttachment(f));
    }
    if (valid.length > 0) {
      setPendingAttachments((prev) => [...prev, ...valid]);
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      const removed = prev.find((a) => a.id === id);
      if (removed?.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
      return next;
    });
  };

  const attachSampleFile = () => {
    if (pendingAttachments.some((a) => a.id === sampleAttachment.id)) return;
    if (pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) return;
    setPendingAttachments((prev) => [...prev, sampleAttachment]);
    setAttachmentError(null);
  };

  // When user sends only files (no text), run the file-summary flow locally.
  const runFileSummaryFlow = async (attachments: ChatAttachment[]) => {
    if (!myAgent) return;
    setLoading(true);
    setActivitySteps([]);

    pushMsg("You", "", "user", { attachments });

    const startTime = Date.now();
    pushActivity(
      `Received ${attachments.length} file${attachments.length > 1 ? "s" : ""}`,
      attachments.map((a) => a.name).join(", "),
      "step",
    );

    const thinkingId = pushMsg(myAgent.name, "Reading the file...", "thinking");

    try {
      for (const att of attachments) {
        await wait(400);
        pushActivity(`Parsing ${att.name}`, `${Math.round(att.size_bytes / 1024)} KB`, "step", {
          elapsed: `+${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        });
        const summary = await summarizeAttachment(att);

        await wait(300);
        pushActivity("Identified contributors", `${summary.contributors.length} people`, "source", {
          elapsed: `+${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        });
        pushActivity("Extracted action items", `${summary.action_items.length} items`, "step", {
          elapsed: `+${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        });

        removeMsg(thinkingId);
        pushMsg(myAgent.name, summaryToMarkdown(summary), "agent");
      }

      // Round-trip: agent sends a file back.
      await wait(500);
      pushActivity("Sending file back", "Updated spec attached", "step", {
        elapsed: `+${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      });
      pushMsg(
        myAgent.name,
        "I've added my notes to a follow-up version of the spec — sending it back so you can diff against the original.",
        "agent",
        {
          attachments: [
            {
              ...sampleAttachment,
              id: crypto.randomUUID(),
              name: "Q2 Launch PRD — agent notes.md",
              source: "agent_reply",
            },
          ],
        },
      );

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      pushActivity("Done", `Total: ${totalTime}s`, "done", { elapsed: `${totalTime}s` });
    } catch {
      removeMsg(thinkingId);
      pushMsg("System", "Could not summarize the file.", "system");
    } finally {
      setLoading(false);
    }
  };

  // ---- Streaming orchestration ----
  const toggleVoice = () => {
    if (typeof window === "undefined") return;
    const w = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
      alert(
        "Voice input isn't supported in this browser. Use Chrome, Edge, or Safari.",
      );
      return;
    }

    const current = recognitionRef.current as SpeechRecognitionLike | null;
    if (listening && current) {
      try {
        current.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    voiceBaseRef.current = input ? input.replace(/\s+$/, "") + " " : "";

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += txt;
        else interimText += txt;
      }
      if (finalText) {
        voiceBaseRef.current = (voiceBaseRef.current + finalText).replace(
          /\s+/g,
          " ",
        );
      }
      const merged = (voiceBaseRef.current + interimText).trimStart();
      setInput(merged);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  useEffect(() => {
    return () => {
      const current = recognitionRef.current as SpeechRecognitionLike | null;
      if (current) {
        try {
          current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    const attachmentsToSend = pendingAttachments;

    // Nothing to send
    if (!message && attachmentsToSend.length === 0) return;
    if (loading || !myAgent) return;

    setInput("");
    setPendingAttachments([]);
    setAttachmentError(null);

    // Pure file drop → run local summary flow (no backend call).
    if (!message && attachmentsToSend.length > 0) {
      await runFileSummaryFlow(attachmentsToSend);
      return;
    }

    setLoading(true);

    // Clear activity for new query
    setActivitySteps([]);
    setCurrentSources([]);

    pushMsg("You", message, "user", {
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
    });

    const thinkingId = pushMsg(myAgent.name, "Thinking...", "thinking");
    const startTime = Date.now();

    pushActivity(
      "Received your query",
      message.length > 60 ? message.slice(0, 60) + "..." : message,
      "step",
    );

    if (attachmentsToSend.length > 0) {
      pushActivity(
        `Attached ${attachmentsToSend.length} file${attachmentsToSend.length > 1 ? "s" : ""}`,
        attachmentsToSend.map((a) => a.name).join(", "),
        "step",
      );
    }

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
    // Revoke blob URLs to avoid leaks
    pendingAttachments.forEach((a) => {
      if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
    });
    messages.forEach((m) => {
      m.attachments?.forEach((a) => {
        if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
    });
    setMessages([]);
    setApproval(null);
    setActivitySteps([]);
    setReachOuts([]);
    setCurrentSources([]);
    setSessionId(null);
    setPendingAttachments([]);
    setAttachmentError(null);
    closeSlackChannel();
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
  const totalUnread = slackChannels.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="flex h-full bg-obsidian text-parchment">
      {/* ======== LEFT PANEL: People / Inbox / Slack ======== */}
      <div className="w-64 border-r border-white/[0.06] flex flex-col shrink-0">
        <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
          <div
            role="tablist"
            aria-label="People, inbox, or Slack"
            className="flex items-center bg-ink border border-white/[0.06] rounded-lg p-0.5"
          >
            <button
              role="tab"
              aria-selected={leftTab === "people"}
              onClick={() => setLeftTab("people")}
              className={`flex-1 flex items-center justify-center gap-1 text-[11px] px-1.5 py-1 rounded-md transition ${
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
              className={`flex-1 flex items-center justify-center gap-1 text-[11px] px-1.5 py-1 rounded-md transition ${
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
            <button
              role="tab"
              aria-selected={leftTab === "slack"}
              onClick={() => setLeftTab("slack")}
              className={`flex-1 flex items-center justify-center gap-1 text-[11px] px-1.5 py-1 rounded-md transition ${
                leftTab === "slack"
                  ? "bg-white/[0.08] text-bone"
                  : "text-smoke hover:text-parchment"
              }`}
            >
              <MessageCircle className="w-3 h-3" />
              Slack
              {totalUnread > 0 && (
                <span className="ml-0.5 text-[9px] bg-[#611f69]/30 text-[#c7a5d1] border border-[#611f69]/50 rounded px-1">
                  {totalUnread}
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
          ) : leftTab === "inbox" ? (
            inbox.length === 0 ? (
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
            )
          ) : slackChannels.length === 0 ? (
            <EmptyPanel
              icon={<MessageCircle className="w-4 h-4 text-dusk" />}
              label="No Slack channels connected"
            />
          ) : (
            <div className="space-y-0.5">
              <div className="px-2 pt-1 pb-1 text-[9px] uppercase tracking-widest text-dusk font-semibold">
                Channels
              </div>
              {slackChannels
                .filter((c) => c.kind === "channel")
                .map((c) => (
                  <SlackChannelRow
                    key={c.id}
                    channel={c}
                    active={activeSlackChannel?.id === c.id}
                    onClick={() => openSlackChannel(c)}
                  />
                ))}
              <div className="px-2 pt-3 pb-1 text-[9px] uppercase tracking-widest text-dusk font-semibold">
                Direct messages
              </div>
              {slackChannels
                .filter((c) => c.kind !== "channel")
                .map((c) => (
                  <SlackChannelRow
                    key={c.id}
                    channel={c}
                    active={activeSlackChannel?.id === c.id}
                    onClick={() => openSlackChannel(c)}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ======== CENTER: Chat OR Slack thread ======== */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeSlackChannel ? (
          <SlackThreadView
            channel={activeSlackChannel}
            messages={slackThread}
            loading={slackLoading}
            onClose={closeSlackChannel}
            onBringIntoChat={(msg) => {
              closeSlackChannel();
              setLeftTab("people");
              handleSend(
                `From Slack #${activeSlackChannel.name}, ${msg.author} said: "${msg.text}". What should I do about this?`,
              );
            }}
          />
        ) : (
          <>
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
                  <button
                    type="button"
                    onClick={attachSampleFile}
                    className="mt-4 flex items-center gap-2 text-[11px] text-smoke hover:text-parchment px-3 py-1.5 rounded-lg bg-ink border border-white/[0.08] hover:border-white/[0.15] transition"
                  >
                    <FileText className="w-3 h-3" />
                    Try the sample file
                  </button>
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
                    attachments={msg.attachments}
                    channel={msg.channel}
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

              {/* Pending attachment chips */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingAttachments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-ink border border-white/[0.08] text-[11px] text-parchment"
                    >
                      <FileText className="w-3 h-3 text-smoke" />
                      <span className="max-w-[180px] truncate">{a.name}</span>
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(a.id)}
                        className="text-dusk hover:text-parchment transition"
                        aria-label={`Remove ${a.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {attachmentError && (
                <p className="text-[11px] text-claret mb-2">{attachmentError}</p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFilesPicked(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                  aria-label="Attach file"
                  title="Attach file"
                  className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-ink border border-white/[0.06] hover:border-white/[0.12] text-smoke hover:text-parchment transition disabled:opacity-40"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={loading || !voiceSupported}
                  aria-pressed={listening}
                  aria-label={listening ? "Stop dictation" : "Dictate"}
                  title={
                    !voiceSupported
                      ? "Voice input not supported in this browser"
                      : listening
                        ? "Stop dictation"
                        : "Dictate"
                  }
                  className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border transition disabled:opacity-40 ${
                    listening
                      ? "bg-[rgba(220,38,38,0.18)] border-[rgba(220,38,38,0.45)] text-[#F87171] animate-pulse"
                      : "bg-ink border-white/[0.06] hover:border-white/[0.12] text-smoke hover:text-parchment"
                  }`}
                >
                  {listening ? (
                    <Mic className="w-4 h-4" />
                  ) : voiceSupported ? (
                    <Mic className="w-4 h-4" />
                  ) : (
                    <MicOff className="w-4 h-4" />
                  )}
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    pendingAttachments.length > 0
                      ? "Add a note, or hit send to summarize the file…"
                      : "Ask your agent anything…"
                  }
                  disabled={loading}
                  className="flex-1 bg-ink border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-parchment input-focus-glow transition disabled:opacity-50 placeholder:text-dusk"
                />
                <button
                  type="submit"
                  disabled={loading || (!input.trim() && pendingAttachments.length === 0)}
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
          </>
        )}
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

function SlackChannelRow({
  channel,
  active,
  onClick,
}: {
  channel: SlackChannel;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = channel.kind === "channel"
    ? (channel.is_private ? Lock : Hash)
    : MessageCircle;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition text-left ${
        active
          ? "bg-[#611f69]/20 border border-[#611f69]/40"
          : "hover:bg-white/[0.04] border border-transparent"
      }`}
    >
      <Icon className="w-3 h-3 text-smoke shrink-0" />
      <span className="text-xs text-parchment truncate flex-1">
        {channel.name}
      </span>
      {channel.unread > 0 && (
        <span className="text-[9px] bg-[#611f69]/30 text-[#c7a5d1] border border-[#611f69]/50 rounded px-1 shrink-0">
          {channel.unread}
        </span>
      )}
    </button>
  );
}

function SlackThreadView({
  channel,
  messages,
  loading,
  onClose,
  onBringIntoChat,
}: {
  channel: SlackChannel;
  messages: SlackMessage[];
  loading: boolean;
  onClose: () => void;
  onBringIntoChat: (msg: SlackMessage) => void;
}) {
  const Icon = channel.kind === "channel"
    ? (channel.is_private ? Lock : Hash)
    : MessageCircle;

  return (
    <>
      <header className="border-b border-white/[0.06] px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#611f69]/20 border border-[#611f69]/40 flex items-center justify-center">
            <Icon className="w-4 h-4 text-[#c7a5d1]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-medium text-bone">{channel.name}</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#611f69]/20 text-[#c7a5d1] border border-[#611f69]/40">
                Slack
              </span>
            </div>
            <p className="text-[11px] text-smoke">
              {channel.kind === "channel" ? "Channel" : "Direct message"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-smoke hover:text-parchment px-2.5 py-1 rounded-md hover:bg-white/[0.04] transition flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          Back to agent
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="w-5 h-5 border-2 border-white/20 border-t-parchment rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyPanel
            icon={<MessageCircle className="w-4 h-4 text-dusk" />}
            label="No messages yet in this thread"
          />
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex gap-3 group">
              <div className="w-8 h-8 rounded-md bg-graphite border border-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-parchment shrink-0">
                {getInitials(m.author)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-bone">
                    {m.author}
                  </span>
                  <span className="text-[10px] text-dusk font-mono">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm text-parchment mt-0.5 leading-relaxed whitespace-pre-wrap">
                  {m.text}
                </p>
                {(m.reactions && m.reactions.length > 0) || m.thread_reply_count ? (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {m.reactions?.map((r) => (
                      <span
                        key={r.emoji}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-ink border border-white/[0.08] text-parchment"
                      >
                        {r.emoji} {r.count}
                      </span>
                    ))}
                    {m.thread_reply_count && m.thread_reply_count > 0 && (
                      <span className="text-[10px] text-smoke">
                        {m.thread_reply_count} replies
                      </span>
                    )}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => onBringIntoChat(m)}
                  className="mt-1.5 opacity-0 group-hover:opacity-100 text-[10px] text-smoke hover:text-parchment transition"
                >
                  Ask agent about this →
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-white/[0.06] px-5 py-3 shrink-0 bg-ink/40">
        <p className="text-[11px] text-dusk">
          Slack is read-only in V1. Use &quot;Ask agent about this&quot; on a message to bring it into chat.
        </p>
      </div>
    </>
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
