// Per-browser chat history stored in localStorage. Scoped per agent so
// switching accounts (or signing in as a different person on the same
// machine) doesn't bleed conversations across users.
//
// We keep at most MAX_SESSIONS entries; oldest-updated wins eviction.
// Attachments are stripped to metadata only — blob: URLs become invalid
// after page reload and storing base64 bytes here would blow the ~5MB
// localStorage quota fast.

import type { ChatAttachment } from "./types";

export const MAX_SESSIONS = 10;

const STORAGE_PREFIX = "ravenhill:chat-sessions:";

function storageKey(agentId: string): string {
  return `${STORAGE_PREFIX}${agentId}`;
}

export interface StoredMessage {
  id: string;
  sender: string;
  content: string;
  isAgent: boolean;
  timestamp: string;
  type: string;
  attachments?: Array<{
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    source: ChatAttachment["source"];
    // URL deliberately omitted — blob: URLs don't survive reload and
    // base64 payloads would exhaust the localStorage quota.
  }>;
  channel?: string;
}

export interface StoredSession {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
  targetAgentId?: string;
  targetAgentName?: string;
  // When set, the session has been compressed: `messages` is empty and
  // `summary` holds the LLM-generated note. Title and other metadata
  // are preserved so the row still renders sensibly in the dropdown.
  compressed?: boolean;
  summary?: string;
  // Original message count before compression — shown in the dropdown
  // so the user knows "this was a 12-message conversation, now folded
  // into 3 sentences."
  originalMessageCount?: number;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(agentId: string): StoredSession[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(agentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredSession[];
  } catch {
    return [];
  }
}

function writeAll(agentId: string, sessions: StoredSession[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(storageKey(agentId), JSON.stringify(sessions));
  } catch {
    // Quota exceeded or storage disabled — silently drop. History is a
    // UX nicety, not load-bearing.
  }
}

// Newest first; capped at MAX_SESSIONS.
export function listSessions(agentId: string): StoredSession[] {
  return readAll(agentId)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
}

export function loadSession(
  agentId: string,
  sessionId: string,
): StoredSession | null {
  return readAll(agentId).find((s) => s.id === sessionId) ?? null;
}

export function deleteSession(agentId: string, sessionId: string): void {
  writeAll(
    agentId,
    readAll(agentId).filter((s) => s.id !== sessionId),
  );
}

// Replace a session's full message list with a compressed summary. The
// session row stays in history (it still counts against MAX_SESSIONS)
// but `messages` is emptied and `summary` carries the gist.
export function markSessionCompressed(
  agentId: string,
  sessionId: string,
  summary: string,
): void {
  const all = readAll(agentId);
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx < 0) return;
  const original = all[idx];
  all[idx] = {
    ...original,
    messages: [],
    compressed: true,
    summary,
    originalMessageCount:
      original.originalMessageCount ?? original.messages.length,
    updatedAt: Date.now(),
  };
  writeAll(agentId, all);
}

// Derive a human-readable title from the first user message, falling
// back to the first message of any kind. Truncated to keep dropdown rows
// tidy.
function deriveTitle(messages: StoredMessage[]): string {
  const firstUser = messages.find((m) => m.type === "user" && m.content.trim());
  const firstAny = messages.find((m) => m.content.trim());
  const raw = (firstUser ?? firstAny)?.content ?? "New conversation";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}

// Upserts the session and evicts oldest entries beyond MAX_SESSIONS.
// Skips writes for empty sessions so opening the page and never sending
// doesn't pollute the history list.
export function saveSession(
  agentId: string,
  session: Omit<StoredSession, "title" | "updatedAt" | "createdAt"> & {
    createdAt?: number;
  },
): void {
  if (!session.messages.length) return;

  const all = readAll(agentId);
  const existing = all.find((s) => s.id === session.id);
  const now = Date.now();

  const next: StoredSession = {
    id: session.id,
    title: deriveTitle(session.messages),
    messages: session.messages,
    createdAt: existing?.createdAt ?? session.createdAt ?? now,
    updatedAt: now,
    targetAgentId: session.targetAgentId,
    targetAgentName: session.targetAgentName,
  };

  const merged = [next, ...all.filter((s) => s.id !== session.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);

  writeAll(agentId, merged);
}

export function newSessionId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Human-friendly relative time for history dropdown rows.
export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}
