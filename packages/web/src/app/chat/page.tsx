"use client";

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Search,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  Trash2,
  Wand2,
  Loader2,
} from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import ApprovalPopup from "@/components/ApprovalPopup";
import { useAuth } from "@/lib/AuthContext";
import {
  orchestrate,
  orchestrateStream,
  submitApproval,
  completeDocRequest,
  fetchAgents,
  sendAgentMessage,
  sendFileToAgent,
  fetchAgentInbox,
  fetchAgentThread,
  parseFileMarker,
  summarizeSession,
  uploadFileToDrive,
  type AgentLedgerMessage,
} from "@/lib/api";
import {
  fetchSlackChannels,
  fetchSlackThread,
} from "@/lib/mocks";
import {
  listSessions,
  loadSession,
  saveSession,
  deleteSession,
  markSessionCompressed,
  newSessionId,
  formatRelative,
  MAX_SESSIONS,
  type StoredSession,
} from "@/lib/chatHistory";
import type {
  ChatAttachment,
  NotificationItem,
  SlackChannel,
  SlackMessage,
  VerificationStatus,
} from "@/lib/types";

function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Adapt an inter-agent ledger row to the existing notification UI shape.
// Read state is derived from the ledger row's `status`: `delivered` counts
// as unread; `read` and `replied` count as read. File-share rows get a
// dedicated label so the inbox preview doesn't leak the encoded marker.
function ledgerToNotification(m: AgentLedgerMessage): NotificationItem {
  const parsed = parseFileMarker(m.content);
  const action = parsed
    ? `${m.from_name || "Someone"} shared a file`
    : `${m.from_name || "Someone"}'s agent reached out`;
  const summary = parsed
    ? `${parsed.attachment.name} · ${formatBytesShort(parsed.attachment.size_bytes)}`
    : m.content;
  return {
    id: m.id,
    action,
    change_summary: summary,
    actor: m.from_name || undefined,
    source: m.intent || "agent",
    verification: "verified" as VerificationStatus,
    read: m.status === "read" || m.status === "replied",
    created_at: m.created_at,
    href: `/chat?to=${m.from_agent_id}`,
  };
}

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
  type:
    | "user"
    | "agent"
    | "system"
    | "thinking"
    | "file_choice"
    | "team_picker";
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

// File types we can read as text on the client. Anything else falls back to
// the heuristic mock summary below until Drive ingestion ships server-side.
const TEXTUAL_MIME_PREFIXES = ["text/"];
const TEXTUAL_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/x-typescript",
  "application/sql",
]);
const TEXTUAL_EXTENSIONS = new Set([
  "md", "txt", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "htm",
  "css", "scss", "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java",
  "kt", "swift", "c", "h", "cpp", "hpp", "sh", "bash", "zsh", "sql",
  "ini", "cfg", "toml", "log", "rst", "tex",
]);
const MAX_TEXT_BYTES = 64 * 1024; // 64 KB ceiling on the prompt content.

function isTextual(att: ChatAttachment): boolean {
  const mime = (att.mime_type || "").toLowerCase();
  if (TEXTUAL_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  if (TEXTUAL_MIME_EXACT.has(mime)) return true;
  const ext = att.name.split(".").pop()?.toLowerCase() || "";
  return TEXTUAL_EXTENSIONS.has(ext);
}

async function readAttachmentAsText(att: ChatAttachment): Promise<string> {
  if (!att.url || !att.url.startsWith("blob:")) {
    throw new Error("attachment has no readable blob");
  }
  const res = await fetch(att.url);
  const blob = await res.blob();
  // Trim the blob first so we don't pull megabytes of text into memory.
  const trimmed =
    blob.size > MAX_TEXT_BYTES ? blob.slice(0, MAX_TEXT_BYTES) : blob;
  return trimmed.text();
}

function smartMockSummary(att: ChatAttachment): string {
  const sizeKB = Math.max(1, Math.round(att.size_bytes / 1024));
  const ext = att.name.split(".").pop()?.toLowerCase() || "";
  const lower = att.name.toLowerCase();

  let kind: string;
  if (ext === "pdf") kind = "PDF";
  else if (["xlsx", "xls", "csv"].includes(ext)) kind = "spreadsheet";
  else if (["pptx", "ppt", "key"].includes(ext)) kind = "slide deck";
  else if (["docx", "doc", "pages"].includes(ext)) kind = "Word document";
  else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    kind = "image";
  else if (["mp4", "mov", "webm", "mkv"].includes(ext)) kind = "video";
  else if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) kind = "archive";
  else kind = att.mime_type || "binary file";

  let topic = "";
  if (lower.includes("prd") || lower.includes("spec"))
    topic = " Filename suggests a product spec or PRD.";
  else if (lower.includes("report"))
    topic = " Filename suggests a report.";
  else if (lower.includes("budget") || lower.includes("forecast"))
    topic = " Filename suggests a financial document.";
  else if (lower.includes("deck") || lower.includes("pitch"))
    topic = " Filename suggests a slide deck or pitch.";
  else if (lower.includes("contract") || lower.includes("msa"))
    topic = " Filename suggests a contract.";
  else if (lower.includes("notes") || lower.includes("minutes"))
    topic = " Filename suggests meeting notes.";

  return [
    `**${att.name}** — ${kind}, ${sizeKB} KB.`,
    "",
    `I can't read this file type directly yet, so I can't give you an accurate content summary.${topic}`,
    "",
    "Real parsing of non-text uploads lands when the Drive ingestion adapter ships. For now, share a `.md`, `.txt`, `.csv`, `.json`, or code file and I'll summarize the actual contents.",
  ].join("\n");
}

const SUMMARY_PROMPT = (att: ChatAttachment, content: string) =>
  `You are summarizing a file the user just uploaded. Read the content carefully and produce a SPECIFIC summary that names actual people, dates, decisions, numbers, and action items found in the file. Do not give a generic "this document discusses…" summary.

File name: ${att.name}
MIME type: ${att.mime_type || "unknown"}
Size: ${Math.round(att.size_bytes / 1024)} KB

----- BEGIN FILE CONTENT -----
${content}
----- END FILE CONTENT -----

Reply in markdown with:
- A one-line gist (be specific to this file)
- 3–6 bullets covering the concrete things actually in the file (people, dates, decisions, action items, numbers)
- An "Open questions" line only if the file has unresolved items

If the content is truncated or unintelligible, say so plainly instead of inventing details.`;

// ---- Main Component ----

function ChatInner() {
  const { agent: myAgent } = useAuth();
  const searchParams = useSearchParams();
  const urlToAgentId = searchParams.get("to");
  const targetedForRef = useRef<string | null>(null);
  const [targetAgent, setTargetAgent] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<unknown>(null);
  const voiceBaseRef = useRef<string>("");
  const [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Local chat history (browser-only, per-agent localStorage). The
  // `currentSessionLocalId` identifies which slot in history this open
  // conversation is bound to; rotates when the user clicks "New chat" or
  // loads a past session from the dropdown.
  const [currentSessionLocalId, setCurrentSessionLocalId] = useState<string>(
    () => newSessionId(),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<StoredSession[]>([]);
  const [compressingId, setCompressingId] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Pending attachments staged for the next send
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Top-right toast for share confirmations.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Three-panel state
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [reachOuts, setReachOuts] = useState<AgentReachOut[]>([]);
  const [currentSources, setCurrentSources] = useState<string[]>([]);

  // Panel tabs
  const [leftTab, setLeftTab] = useState<"people" | "inbox" | "slack">("people");
  const [rightTab, setRightTab] = useState<"reasoning" | "activity">("reasoning");
  const [people, setPeople] = useState<Array<{ id: string; name: string; role: string }>>([]);
  // Real inter-agent inbox (rows from /api/messages/inbox). The displayed
  // `inbox` is derived from this — keeping the raw form lets us reply by id.
  const [rawInbox, setRawInbox] = useState<AgentLedgerMessage[]>([]);
  const inbox: NotificationItem[] = rawInbox.map(ledgerToNotification);
  // Persisted thread between you and the current targetAgent (both directions).
  const [threadMessages, setThreadMessages] = useState<AgentLedgerMessage[]>([]);

  // Slack state
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [activeSlackChannel, setActiveSlackChannel] = useState<SlackChannel | null>(null);
  const [slackThread, setSlackThread] = useState<SlackMessage[]>([]);
  const [slackLoading, setSlackLoading] = useState(false);

  // Tracks file_share inbox row IDs we've already toasted for, so the
  // 5-second poll doesn't re-fire the toast on every tick. Initialised
  // from the first inbox fetch so existing shares don't toast on mount.
  const seenFileMsgIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!myAgent) return;
    fetchAgents()
      .then((agents) => {
        if (Array.isArray(agents)) {
          // Hide the caller from the People list — there's no value in
          // letting someone "reach out" to themselves through the
          // direct-line UI (we already have a self-chat surface).
          setPeople(
            agents
              .filter((a: { id: string }) => a.id !== myAgent.id)
              .map((a: { id: string; name: string; role: string }) => ({
                id: a.id,
                name: a.name,
                role: a.role,
              })),
          );
        }
      })
      .catch(() => setPeople([]));
    fetchAgentInbox()
      .then((rows) => {
        setRawInbox(rows);
        // Prime the seen-file set on mount so we don't toast for shares
        // that landed while the user was offline.
        seenFileMsgIdsRef.current = new Set(
          rows
            .filter(
              (r) =>
                r.intent === "file_share" && r.from_agent_id !== myAgent.id,
            )
            .map((r) => r.id),
        );
      })
      .catch(() => setRawInbox([]));
    fetchSlackChannels().then(setSlackChannels).catch(() => setSlackChannels([]));
  }, [myAgent]);

  // Poll the inbox every 5s so incoming messages from other agents land
  // without a refresh. Cheap GET; replace with SSE when we wire it. New
  // file_share rows fire a top-right toast so the recipient sees an
  // immediate confirmation regardless of which tab they're viewing.
  useEffect(() => {
    if (!myAgent) return;
    const tick = () => {
      fetchAgentInbox()
        .then((rows) => {
          setRawInbox(rows);
          if (seenFileMsgIdsRef.current === null) {
            seenFileMsgIdsRef.current = new Set();
          }
          for (const r of rows) {
            if (
              r.intent !== "file_share" ||
              r.from_agent_id === myAgent.id ||
              seenFileMsgIdsRef.current.has(r.id)
            ) {
              continue;
            }
            seenFileMsgIdsRef.current.add(r.id);
            const parsed = parseFileMarker(r.content);
            const fname = parsed?.attachment.name || "a file";
            const sender = r.from_name || "A teammate";
            showToast(`${sender} shared ${fname} with you`);
          }
        })
        .catch(() => {
          /* swallow — keep last good inbox */
        });
    };
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [myAgent, showToast]);

  // Poll the open direct-line thread every 3s. Faster than the inbox poll
  // because the user is actively waiting on this exchange.
  useEffect(() => {
    if (!myAgent || !targetAgent) {
      setThreadMessages([]);
      return;
    }
    let cancelled = false;
    const tick = () => {
      fetchAgentThread(targetAgent.id)
        .then((msgs) => {
          if (!cancelled) setThreadMessages(msgs);
        })
        .catch(() => {
          /* swallow */
        });
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [myAgent, targetAgent]);

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

  // Start a direct conversation with a teammate's agent. Sends go through
  // POST /api/messages/agent so they're persisted real messages — the
  // recipient sees them in their inbox, no LLM fabrication.
  const reachOutTo = useCallback(
    (person: { id: string; name: string; role: string }) => {
      setTargetAgent(person);
      targetedForRef.current = person.id;
      setMessages([]);
      setThreadMessages([]);
      setActivitySteps([]);
      setCurrentSources([]);
      queueMicrotask(() => inputRef.current?.focus());
    },
    [],
  );

  // Sync the displayed messages from the persisted thread whenever the
  // poll updates. In direct-line mode the DB is the source of truth.
  // File shares (intent === "file_share") arrive as text bodies with an
  // embedded marker — decode them so the recipient sees a real file card.
  useEffect(() => {
    if (!targetAgent || !myAgent) return;
    const synced: Message[] = threadMessages.map((m) => {
      const mine = m.from_agent_id === myAgent.id;
      const parsed = parseFileMarker(m.content);
      const baseContent = parsed ? parsed.preamble : m.content;
      return {
        id: m.id,
        sender: mine ? "You" : m.from_name || targetAgent.name,
        content: baseContent,
        isAgent: !mine,
        timestamp: new Date(m.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: mine ? "user" : "agent",
        attachments: parsed ? [parsed.attachment] : undefined,
      };
    });
    setMessages(synced);
  }, [threadMessages, targetAgent, myAgent]);

  const clearTarget = useCallback(() => {
    setTargetAgent(null);
    targetedForRef.current = null;
  }, []);

  useEffect(() => {
    if (!urlToAgentId || people.length === 0) return;
    if (targetedForRef.current === urlToAgentId) return;
    const target = people.find((p) => p.id === urlToAgentId);
    if (!target) return;
    reachOutTo(target);
  }, [urlToAgentId, people, reachOutTo]);

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

  // When user sends only files (no text), surface two choices in chat:
  // summarize the file, or send it to a teammate.
  const offerPostUploadChoices = (attachments: ChatAttachment[]) => {
    if (!myAgent) return;
    pushMsg("You", "", "user", { attachments });
    pushActivity(
      `Received ${attachments.length} file${attachments.length > 1 ? "s" : ""}`,
      attachments.map((a) => a.name).join(", "),
      "step",
    );
    pushMsg(
      myAgent.name,
      `Got ${attachments.length === 1 ? "your file" : "your files"}. What would you like to do?`,
      "file_choice",
      { attachments },
    );
  };

  // Real summary path: read text-readable files via FileReader and ask the
  // orchestrator to summarize the actual content. Non-text files fall back
  // to a heuristic mock that's honest about not parsing the bytes.
  const runFileSummary = async (
    attachments: ChatAttachment[],
    choiceMessageId: string,
  ) => {
    if (!myAgent) return;
    removeMsg(choiceMessageId);
    setLoading(true);
    const startTime = Date.now();
    const thinkingId = pushMsg(myAgent.name, "Reading the file…", "thinking");

    try {
      for (const att of attachments) {
        const sizeKB = Math.max(1, Math.round(att.size_bytes / 1024));
        pushActivity(`Reading ${att.name}`, `${sizeKB} KB`, "step", {
          elapsed: `+${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        });

        let summaryText: string;
        if (isTextual(att)) {
          try {
            const content = await readAttachmentAsText(att);
            pushActivity(
              "Asking the model to summarize",
              `${content.length.toLocaleString()} chars`,
              "step",
              {
                elapsed: `+${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              },
            );
            const res = await orchestrate(myAgent.id, SUMMARY_PROMPT(att, content));
            const answer =
              typeof res?.answer === "string" && res.answer.trim().length > 0
                ? res.answer
                : null;
            summaryText = answer ?? smartMockSummary(att);
          } catch {
            // Reading or model call failed — fall back to the honest mock.
            summaryText = smartMockSummary(att);
          }
        } else {
          summaryText = smartMockSummary(att);
        }

        removeMsg(thinkingId);
        pushMsg(myAgent.name, summaryText, "agent");
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      pushActivity("Done", `Total: ${totalTime}s`, "done", {
        elapsed: `${totalTime}s`,
      });
    } catch {
      removeMsg(thinkingId);
      pushMsg("System", "Could not summarize the file.", "system");
    } finally {
      setLoading(false);
    }
  };

  // "Send to teammate" path: replace the choice message with an inline
  // searchable picker. Selection in the picker triggers `sendFilesToPerson`.
  const promptForRecipient = (
    attachments: ChatAttachment[],
    choiceMessageId: string,
  ) => {
    if (!myAgent) return;
    removeMsg(choiceMessageId);
    pushMsg(
      myAgent.name,
      "Who should I send this to?",
      "team_picker",
      { attachments },
    );
  };

  const cancelPicker = (pickerMessageId: string) => {
    removeMsg(pickerMessageId);
  };

  const sendFilesToPerson = async (
    attachments: ChatAttachment[],
    person: { id: string; name: string },
    pickerMessageId: string,
  ) => {
    if (!myAgent) return;
    removeMsg(pickerMessageId);
    setLoading(true);
    const startTime = Date.now();
    pushActivity(
      `Sending to ${person.name}`,
      attachments.map((a) => a.name).join(", "),
      "step",
    );

    try {
      for (const att of attachments) {
        await sendFileToAgent(person.id, att);
        showToast(`This ${att.name} was sent to ${person.name}`);
        pushMsg(
          "System",
          `${att.name} was sent to ${person.name}`,
          "system",
        );
        // Best-effort: mirror the file into the sender's Google Drive in
        // a "Ravenhill — Shared files" folder. Failure here is silent —
        // the ledger share is the source of truth; the Drive copy is a
        // convenience so the user can find it later from drive.google.com.
        if (att.url && att.url.startsWith("blob:")) {
          try {
            const blobRes = await fetch(att.url);
            const blob = await blobRes.blob();
            const result = await uploadFileToDrive(
              blob,
              att.name,
              att.mime_type || blob.type || "application/octet-stream",
            );
            if (result.uploaded && result.file?.url) {
              pushMsg(
                "System",
                `${att.name} also mirrored to your Drive — ${result.file.url}`,
                "system",
              );
            }
          } catch {
            // Network / blob unreadable — ignore, share is already done.
          }
        }
      }
      pushActivity(
        "Sent",
        `${attachments.length === 1 ? "1 file" : `${attachments.length} files`} to ${person.name}`,
        "done",
        {
          elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        },
      );
    } catch (err) {
      pushMsg(
        "System",
        `Couldn't send to ${person.name}: ${(err as Error).message || "unknown error"}`,
        "system",
      );
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

    // Pure file drop → present the two choices in chat (summarize / send).
    if (!message && attachmentsToSend.length > 0) {
      offerPostUploadChoices(attachmentsToSend);
      return;
    }

    setLoading(true);

    // Clear activity for new query
    setActivitySteps([]);
    setCurrentSources([]);

    // Direct-line: real inter-agent message, persisted to the ledger.
    // No fabricated LLM reply on the sender's screen — the recipient
    // sees this on their next inbox poll and can reply in their own
    // voice.
    if (targetAgent) {
      // Optimistic render so the typed message lands immediately.
      pushMsg("You", message, "user", {
        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      });
      pushActivity(
        `Sent to ${targetAgent.name}`,
        targetAgent.role,
        "step",
      );
      try {
        await sendAgentMessage(targetAgent.id, message);
        // Pull the canonical thread immediately so the optimistic
        // message is replaced by the persisted row and any incoming
        // reply from a fast recipient lands without waiting for the
        // 3s poll.
        const fresh = await fetchAgentThread(targetAgent.id);
        setThreadMessages(fresh);
        pushActivity(
          "Awaiting reply",
          `${targetAgent.name} will see this in their inbox`,
          "done",
        );
      } catch (err) {
        pushMsg(
          "System",
          `Couldn't send to ${targetAgent.name}'s agent: ${(err as Error).message || "unknown error"}`,
          "system",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

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

  // Starts a fresh chat session. Clears client-side state, drops the
  // server `sessionId`, and rotates `currentSessionLocalId` so the new
  // conversation persists as its own slot in localStorage history.
  const handleNewChat = () => {
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
    setCurrentSessionLocalId(newSessionId());
    closeSlackChannel();
  };

  // Restore a previous session from local history. Attachments come
  // back as metadata only — their bytes don't survive localStorage.
  // Compressed sessions are read-only (their summary stays inline in
  // the dropdown) so we skip restore for them.
  const handleLoadHistory = (sessionLocalId: string) => {
    if (!myAgent) return;
    const stored = loadSession(myAgent.id, sessionLocalId);
    if (!stored || stored.compressed) return;
    messages.forEach((m) => {
      m.attachments?.forEach((a) => {
        if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
    });
    const restored: Message[] = stored.messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      content: m.content,
      isAgent: m.isAgent,
      timestamp: m.timestamp,
      type: m.type as Message["type"],
      channel: m.channel,
      attachments: m.attachments?.map((a) => ({
        id: a.id,
        name: a.name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        source: a.source,
      })),
    }));
    setMessages(restored);
    setApproval(null);
    setActivitySteps([]);
    setReachOuts([]);
    setCurrentSources([]);
    setSessionId(null);
    setPendingAttachments([]);
    setAttachmentError(null);
    setCurrentSessionLocalId(sessionLocalId);
    setHistoryOpen(false);
  };

  const handleDeleteHistory = (sessionLocalId: string) => {
    if (!myAgent) return;
    deleteSession(myAgent.id, sessionLocalId);
    setHistorySessions(listSessions(myAgent.id));
  };

  // Compress an older session: call the backend to produce a short
  // summary, then replace the session's messages with that summary in
  // localStorage. The row stays in history (still counts toward
  // MAX_SESSIONS) but reads as a 2–4 sentence note instead of the full
  // thread.
  const handleCompressHistory = async (sessionLocalId: string) => {
    if (!myAgent || compressingId) return;
    const stored = loadSession(myAgent.id, sessionLocalId);
    if (!stored || stored.compressed || stored.messages.length === 0) return;
    setCompressingId(sessionLocalId);
    try {
      const summary = await summarizeSession(
        stored.messages.map((m) => ({
          role: m.type === "user" ? "user" : "assistant",
          content: m.content,
        })),
      );
      markSessionCompressed(myAgent.id, sessionLocalId, summary);
      setHistorySessions(listSessions(myAgent.id));
    } catch {
      // Surface failure via the same toast channel used for share confirmations
      showToast("Couldn't compress chat — try again later.");
    } finally {
      setCompressingId(null);
    }
  };

  // Persist the active conversation to localStorage whenever it
  // changes. `saveSession` no-ops on empty message lists so opening the
  // page and never sending anything doesn't pollute history.
  useEffect(() => {
    if (!myAgent) return;
    saveSession(myAgent.id, {
      id: currentSessionLocalId,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        content: m.content,
        isAgent: m.isAgent,
        timestamp: m.timestamp,
        type: m.type,
        channel: m.channel,
        attachments: m.attachments?.map((a) => ({
          id: a.id,
          name: a.name,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          source: a.source,
        })),
      })),
      targetAgentId: targetAgent?.id,
      targetAgentName: targetAgent?.name,
    });
  }, [messages, currentSessionLocalId, myAgent, targetAgent]);

  // Refresh the history list whenever the dropdown opens so it reflects
  // the latest entries (including the one being actively written to).
  useEffect(() => {
    if (!historyOpen || !myAgent) return;
    setHistorySessions(listSessions(myAgent.id));
  }, [historyOpen, myAgent, messages]);

  // Close the history dropdown on outside click / Escape.
  useEffect(() => {
    if (!historyOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!historyRef.current?.contains(e.target as Node)) setHistoryOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [historyOpen]);

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
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => reachOutTo(p)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-ink border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02] transition animate-fade-up text-left press-scale"
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
                  </button>
                ))}
              </div>
            )
          ) : leftTab === "inbox" ? (
            rawInbox.length === 0 ? (
              <EmptyPanel
                icon={<Inbox className="w-4 h-4 text-dusk" />}
                label="Inbox zero"
              />
            ) : (
              <div className="space-y-1">
                {rawInbox.map((m) => {
                  // Open the persisted thread with whoever sent the
                  // message — clicking is the user's "I'm answering this"
                  // signal. The recipient (us) becomes the sender of the
                  // reply once they type.
                  const senderRole =
                    people.find((p) => p.id === m.from_agent_id)?.role || "Member";
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        reachOutTo({
                          id: m.from_agent_id,
                          name: m.from_name || "Teammate",
                          role: senderRole,
                        })
                      }
                      className="w-full text-left"
                    >
                      <InboxRow item={ledgerToNotification(m)} />
                    </button>
                  );
                })}
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
              <div className="flex items-center gap-1">
                <button
                  onClick={handleNewChat}
                  className="text-xs text-smoke hover:text-parchment px-2.5 py-1 rounded-md hover:bg-white/[0.04] transition"
                >
                  New chat
                </button>
                <div className="relative" ref={historyRef}>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={historyOpen}
                    aria-label="Chat history"
                    className="flex items-center gap-1 text-xs text-smoke hover:text-parchment px-2 py-1 rounded-md hover:bg-white/[0.04] transition"
                  >
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <ChevronDown className="w-3 h-3" strokeWidth={1.75} />
                  </button>
                  {historyOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-1.5 w-72 max-h-96 overflow-y-auto bg-obsidian border border-white/[0.08] rounded-lg shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] py-1 z-30"
                    >
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-dusk border-b border-white/[0.06]">
                        Recent chats · last {MAX_SESSIONS}
                      </div>
                      {historySessions.length === 0 ? (
                        <div className="px-3 py-4 text-[11px] text-dusk">
                          No saved chats yet.
                        </div>
                      ) : (
                        historySessions.map((s) => {
                          const isActive = s.id === currentSessionLocalId;
                          const isCompressing = compressingId === s.id;
                          const msgCount =
                            s.compressed && s.originalMessageCount !== undefined
                              ? s.originalMessageCount
                              : s.messages.length;
                          return (
                            <div
                              key={s.id}
                              className={`group flex items-start gap-2 px-3 py-2 hover:bg-white/[0.04] transition ${
                                isActive ? "bg-white/[0.04]" : ""
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleLoadHistory(s.id)}
                                disabled={s.compressed}
                                className="flex-1 min-w-0 text-left disabled:cursor-default"
                                role="menuitem"
                              >
                                <div className="text-[12px] text-parchment truncate flex items-center gap-1.5">
                                  {s.compressed && (
                                    <Sparkles
                                      className="w-3 h-3 text-claret shrink-0"
                                      strokeWidth={1.75}
                                      aria-label="Summarized"
                                    />
                                  )}
                                  <span className="truncate">{s.title}</span>
                                </div>
                                {s.compressed && s.summary && (
                                  <div className="text-[11px] text-smoke mt-1 leading-snug whitespace-pre-wrap">
                                    {s.summary}
                                  </div>
                                )}
                                <div className="text-[10px] text-dusk flex items-center gap-1.5 mt-0.5">
                                  <span>{formatRelative(s.updatedAt)}</span>
                                  <span>·</span>
                                  <span>
                                    {s.compressed ? "was " : ""}
                                    {msgCount} msg{msgCount === 1 ? "" : "s"}
                                  </span>
                                  {s.targetAgentName && (
                                    <>
                                      <span>·</span>
                                      <span className="truncate">
                                        → {s.targetAgentName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </button>
                              {!s.compressed && s.messages.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompressHistory(s.id);
                                  }}
                                  disabled={isCompressing}
                                  className="opacity-0 group-hover:opacity-100 text-dusk hover:text-claret disabled:opacity-50 transition shrink-0 p-1"
                                  aria-label={`Compress chat: ${s.title}`}
                                  title="Summarize this chat"
                                >
                                  {isCompressing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                                  ) : (
                                    <Wand2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteHistory(s.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-dusk hover:text-claret transition shrink-0 p-1"
                                aria-label={`Delete chat: ${s.title}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </header>

            {targetAgent && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.06] bg-[rgba(139,30,47,0.07)]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-graphite border border-claret/40 flex items-center justify-center text-[9px] font-semibold text-parchment shrink-0">
                    {getInitials(targetAgent.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-bone truncate">
                      Direct line to{" "}
                      <span className="text-claret font-medium">
                        {targetAgent.name}
                      </span>
                      ’s agent
                    </div>
                    <div className="text-[10px] text-dusk truncate">
                      {targetAgent.role}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearTarget}
                  className="flex items-center gap-1 text-[10px] text-smoke hover:text-parchment px-2 py-1 rounded hover:bg-white/[0.04] transition shrink-0"
                  aria-label="Close direct conversation"
                >
                  <X className="w-3 h-3" /> Close
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-dusk">
                  <div
                    className={`w-12 h-12 rounded-2xl ${targetAgent ? "bg-graphite border border-claret/40 text-bone" : agentColor} flex items-center justify-center text-base font-semibold mb-4`}
                  >
                    {getInitials(targetAgent ? targetAgent.name : myAgent.name)}
                  </div>
                  <p className="text-sm text-parchment mb-1">
                    {targetAgent
                      ? `${targetAgent.name}'s agent`
                      : "Your personal agent"}
                  </p>
                  <p className="text-xs text-smoke max-w-xs text-center">
                    {targetAgent
                      ? `Ask anything — you're talking to ${targetAgent.name.split(" ")[0]}'s agent, which answers in their voice from their knowledge.`
                      : "Ask anything — it knows your tasks and meetings, and reaches out to other agents when needed."}
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
                if (msg.type === "file_choice") {
                  return (
                    <FileChoiceCard
                      key={msg.id}
                      sender={msg.sender}
                      content={msg.content}
                      timestamp={msg.timestamp}
                      attachments={msg.attachments || []}
                      onSummarize={() =>
                        runFileSummary(msg.attachments || [], msg.id)
                      }
                      onSendToTeammate={() =>
                        promptForRecipient(msg.attachments || [], msg.id)
                      }
                      disabled={loading}
                    />
                  );
                }
                if (msg.type === "team_picker") {
                  return (
                    <TeamPickerCard
                      key={msg.id}
                      sender={msg.sender}
                      content={msg.content}
                      timestamp={msg.timestamp}
                      attachments={msg.attachments || []}
                      people={people}
                      onPick={(person) =>
                        sendFilesToPerson(
                          msg.attachments || [],
                          person,
                          msg.id,
                        )
                      }
                      onCancel={() => cancelPicker(msg.id)}
                      disabled={loading}
                    />
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

      {/* Top-right share toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 flex items-start gap-2.5 max-w-sm bg-ink border border-white/[0.12] rounded-xl px-4 py-3 shadow-xl animate-fade-up"
        >
          <CheckCircle2 className="w-4 h-4 text-[#88D3A4] mt-0.5 shrink-0" />
          <div className="text-[12px] text-parchment leading-relaxed">
            {toast}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-dusk hover:text-parchment transition shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatInner />
    </Suspense>
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

function FileChoiceCard({
  sender,
  content,
  timestamp,
  attachments,
  onSummarize,
  onSendToTeammate,
  disabled,
}: {
  sender: string;
  content: string;
  timestamp: string;
  attachments: ChatAttachment[];
  onSummarize: () => void;
  onSendToTeammate: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-start mb-3 animate-fade-up">
      <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-graphite/80 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] font-medium text-parchment">{sender}</div>
          <div className="text-[10px] text-dusk font-mono">{timestamp}</div>
        </div>
        <div className="text-sm text-parchment mb-3">{content}</div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-ink border border-white/[0.08] text-parchment"
              >
                <FileText className="w-3 h-3 text-smoke" />
                <span className="max-w-[200px] truncate">{a.name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onSummarize}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 text-[12px] px-3 py-2 rounded-lg bg-ink border border-white/[0.08] hover:border-claret/40 hover:bg-white/[0.02] text-parchment transition disabled:opacity-40"
          >
            <Sparkles className="w-3.5 h-3.5 text-claret" />
            Would you like a summary?
          </button>
          <button
            type="button"
            onClick={onSendToTeammate}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 text-[12px] px-3 py-2 rounded-lg bg-ink border border-white/[0.08] hover:border-claret/40 hover:bg-white/[0.02] text-parchment transition disabled:opacity-40"
          >
            <Users className="w-3.5 h-3.5 text-claret" />
            Whom do you want to send it to?
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamPickerCard({
  sender,
  content,
  timestamp,
  attachments,
  people,
  onPick,
  onCancel,
  disabled,
}: {
  sender: string;
  content: string;
  timestamp: string;
  attachments: ChatAttachment[];
  people: Array<{ id: string; name: string; role: string }>;
  onPick: (person: { id: string; name: string; role: string }) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q),
    );
  }, [people, query]);

  return (
    <div className="flex justify-start mb-3 animate-fade-up">
      <div className="w-full max-w-md rounded-2xl px-4 py-3 bg-graphite/80 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] font-medium text-parchment">{sender}</div>
          <div className="text-[10px] text-dusk font-mono">{timestamp}</div>
        </div>
        <div className="text-sm text-parchment mb-2">{content}</div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-ink border border-white/[0.08] text-parchment"
              >
                <FileText className="w-3 h-3 text-smoke" />
                <span className="max-w-[160px] truncate">{a.name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 bg-ink border border-white/[0.08] rounded-lg px-2.5 py-1.5 mb-2">
          <Search className="w-3.5 h-3.5 text-dusk shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teammates…"
            className="flex-1 bg-transparent text-[12px] text-parchment placeholder:text-dusk outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-56 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-dusk px-2 py-3">
              No teammates match &quot;{query}&quot;.
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    disabled={disabled}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-ink/60 border border-transparent hover:border-claret/30 hover:bg-white/[0.03] transition text-left disabled:opacity-40"
                  >
                    <div className="w-7 h-7 rounded-full bg-graphite border border-white/[0.08] flex items-center justify-center text-[9px] font-semibold text-parchment shrink-0">
                      {p.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-bone truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-dusk truncate">
                        {p.role}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="text-[11px] text-dusk hover:text-parchment transition px-2 py-1 disabled:opacity-40"
          >
            Cancel
          </button>
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
