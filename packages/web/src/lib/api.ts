/**
 * API client for the Ravenhill backend.
 *
 * Every call runs with `credentials: "include"` so the session cookie set
 * by /api/auth/verify travels with the request. CORS on the backend is
 * already configured with allow_credentials=true for the configured
 * origins.
 */
import { readSessionToken } from "@/lib/session";

// API base resolution.
//   1. In the browser on a known production host, hardcode the prod API so a
//      mis-configured env var can never break the site.
//   2. Otherwise read NEXT_PUBLIC_API_URL (build-time inlined) and trim
//      whitespace + trailing slashes.
//   3. Fall back to local dev.
const PROD_API = "https://ravenhill-api.fly.dev";
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (
      host === "raven-hill.org" ||
      host === "www.raven-hill.org" ||
      host === "ravenhillai.com" ||
      host === "www.ravenhillai.com" ||
      host.endsWith(".vercel.app")
    ) {
      return PROD_API;
    }
  }
  const fromEnv = (process.env.NEXT_PUBLIC_API_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return fromEnv || "http://localhost:8000";
}
const API_BASE = resolveApiBase();

// Default init for every request — always include credentials.
const defaultInit: RequestInit = { credentials: "include" };

function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sessionToken =
    typeof document !== "undefined" ? readSessionToken() : "";
  return fetch(`${API_BASE}${path}`, {
    ...defaultInit,
    ...init,
    credentials: sessionToken ? "omit" : "include",
    headers: {
      ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
      ...(init.headers || {}),
    },
  });
}

export async function fetchAgents() {
  const res = await apiFetch("/api/agents");
  return res.json();
}

export async function fetchAgent(agentId: string) {
  const res = await apiFetch(`/api/agents/${agentId}`);
  if (!res.ok) throw new Error(`Fetch agent failed: ${res.status}`);
  return res.json();
}

export interface CreateAgentPayload {
  name: string;
  role: string;
  departments: string[];
  knowledge_areas: string[];
  knowledge_base: string;
  scopes: string[];
}

export async function createAgent(agent: CreateAgentPayload) {
  const res = await apiFetch(`/api/agents/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
  if (!res.ok) throw new Error(`Create agent failed: ${res.status}`);
  return res.json();
}

export async function updateAgent(
  agentId: string,
  updates: Partial<CreateAgentPayload & { is_active: boolean }>,
) {
  const res = await apiFetch(`/api/agents/${agentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update agent failed: ${res.status}`);
  return res.json();
}

export async function deleteAgent(agentId: string) {
  const res = await apiFetch(`/api/agents/${agentId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete agent failed: ${res.status}`);
  return res.json();
}

export async function chatWithAgent(
  agentId: string,
  message: string,
): Promise<{ agent_id: string; agent_name: string; content: string }> {
  const res = await apiFetch(`/api/agents/${agentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message, agent_id: agentId }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `chat failed: ${res.status}`);
  }
  return res.json();
}

export async function sendInterAgentMessage(message: {
  type: string;
  from_agent: string;
  to_agent?: string;
  intent: string;
}) {
  const res = await apiFetch(`/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  return res.json();
}

export interface AgentLedgerMessage {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  from_name: string;
  to_name: string;
  content: string;
  intent: string | null;
  in_reply_to: string | null;
  status: string;
  created_at: string;
}

export async function sendAgentMessage(
  toAgentId: string,
  content: string,
  intent?: string,
): Promise<AgentLedgerMessage> {
  const res = await apiFetch(`/api/messages/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to_agent_id: toAgentId, content, intent }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `send failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAgentInbox(): Promise<AgentLedgerMessage[]> {
  const res = await apiFetch(`/api/messages/inbox`);
  if (!res.ok) throw new Error(`inbox fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchAgentSent(): Promise<AgentLedgerMessage[]> {
  const res = await apiFetch(`/api/messages/sent`);
  if (!res.ok) throw new Error(`sent fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchAgentThread(
  otherAgentId: string,
): Promise<AgentLedgerMessage[]> {
  const res = await apiFetch(`/api/messages/thread/${otherAgentId}`);
  if (!res.ok) throw new Error(`thread fetch failed: ${res.status}`);
  return res.json();
}

export async function replyToAgentMessage(
  ledgerId: string,
  content: string,
): Promise<AgentLedgerMessage> {
  const res = await apiFetch(`/api/messages/${ledgerId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `reply failed: ${res.status}`);
  }
  return res.json();
}

// ---- Tasks / pending items (replaces lib/mocks::fetchPendingItems) ----
//
// Real backing: `TaskRow` rows extracted from meeting transcripts. The
// dashboard / calendar pages render these as a kanban-style board, so
// we adapt to the existing `PendingItem` shape rather than reshaping
// the renderer.

interface TaskRaw {
  id: string;
  meeting_id: string;
  agent_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  source_excerpt: string | null;
  due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const ALLOWED_STATUS = new Set(["todo", "in_progress", "done"]);

// Backend uses "pending" / "in_progress" / "done" / "blocked"; the
// frontend's TaskStatus enum is "todo" / "in_progress" / "done". Map
// both pending and blocked into "todo" (anything not actively in
// progress yet) so the kanban renders without losing rows.
function mapStatus(s: string): "todo" | "in_progress" | "done" {
  if (s === "done") return "done";
  if (s === "in_progress") return "in_progress";
  return "todo";
}

function mapPriority(p: string): "high" | "medium" | "low" {
  return p === "high" || p === "low" ? p : "medium";
}

export async function fetchPendingItems() {
  const res = await apiFetch("/api/meetings/tasks/mine");
  if (!res.ok) return [];
  const rows: TaskRaw[] = await res.json();
  const now = new Date().toISOString();
  return rows
    .filter((r) => ALLOWED_STATUS.has(mapStatus(r.status)))
    .map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      status: mapStatus(r.status),
      priority: mapPriority(r.priority),
      source: "meeting" as const,
      source_ref: r.meeting_id,
      due_date: r.due_date || undefined,
      ready_state: "ready" as const,
      created_at: r.created_at || now,
      updated_at: r.updated_at || now,
    }));
}

// ---- Org / workspace ("/me") ----

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  org_role: "admin" | "member";
  member_count: number;
  invite_code: string | null;
  invite_code_expires_at: string | null;
  invite_approval_required: boolean;
}

export async function fetchMyOrg(): Promise<OrgSummary> {
  const res = await apiFetch("/api/orgs/me");
  if (!res.ok) throw new Error(`org fetch failed: ${res.status}`);
  return res.json();
}

export async function rotateOrgInviteCode(): Promise<{ invite_code: string }> {
  const res = await apiFetch("/api/orgs/rotate-invite-code", {
    method: "POST",
  });
  if (!res.ok) throw new Error(`rotate failed: ${res.status}`);
  return res.json();
}

export async function renameOrg(name: string): Promise<OrgSummary> {
  const res = await apiFetch("/api/orgs/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`rename failed: ${res.status}`);
  return res.json();
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: string;
  org_role: "admin" | "member";
  seniority: string;
  is_active: boolean;
  created_at: string | null;
}

export async function fetchOrgMembers(): Promise<OrgMember[]> {
  const res = await apiFetch("/api/orgs/members");
  if (!res.ok) throw new Error(`members fetch failed: ${res.status}`);
  return res.json();
}

export async function claimTenant(payload: {
  setup_token: string;
  email: string;
  password: string;
  name: string;
}): Promise<{
  agent: Record<string, unknown>;
  workspace_name: string;
  session_token: string;
}> {
  const res = await apiFetch("/api/auth/claim-tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `claim failed: ${res.status}`);
  }
  return res.json();
}

// ---- Behavior tracking + Weekly Report ----
//
// Privacy-aware (per CLAUDE.md): no message content, no email
// content, no file names. Just `{event_type, object_type, object_id,
// status}`. Captured via captureBehavior; aggregated via fetchWeeklyReport.

export type BehaviorEventType =
  | "meeting_clicked"
  | "meeting_attended"
  | "meeting_dismissed"
  | "calendar_event_viewed"
  | "task_created"
  | "task_completed"
  | "task_skipped"
  | "task_reopened"
  | "chat_replied"
  | "chat_thread_opened"
  | "document_opened"
  | "document_shared"
  | "inbox_item_opened";

export async function captureBehavior(payload: {
  event_type: BehaviorEventType;
  object_type?: string;
  object_id?: string;
  status?: string;
}): Promise<void> {
  // Fire-and-forget: a failure here should never break user flow.
  try {
    await apiFetch("/api/behavior/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* swallow — telemetry mustn't crash the UI */
  }
}

export interface WeeklyDayBucket {
  date: string;
  counts: Record<string, number>;
  total: number;
}

export interface WeeklyReport {
  week_start: string;
  week_end: string;
  days: WeeklyDayBucket[];
  totals: Record<string, number>;
  summary: string;
  has_data: boolean;
  generated_at: string;
}

export async function fetchWeeklyReport(): Promise<WeeklyReport> {
  const res = await apiFetch("/api/behavior/weekly-report");
  if (!res.ok) throw new Error(`weekly report fetch failed: ${res.status}`);
  return res.json();
}

// ---- Manual tasks (Todoist-style; "Created Tasks" on the dashboard) ----

export type TaskPriority = "high" | "medium" | "low";
export type ManualTaskStatus = "pending" | "in_progress" | "done" | "blocked";

export interface ManualTask {
  id: string;
  title: string;
  description: string | null;
  status: ManualTaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  source: "manual";
  created_at: string | null;
  updated_at: string | null;
}

export async function fetchManualTasks(includeDone = false): Promise<ManualTask[]> {
  const qs = includeDone ? "?include_done=true" : "";
  const res = await apiFetch(`/api/tasks/manual${qs}`);
  if (!res.ok) throw new Error(`tasks fetch failed: ${res.status}`);
  return res.json();
}

export async function createManualTask(payload: {
  title: string;
  description?: string;
  priority?: TaskPriority;
  due_date?: string;
}): Promise<ManualTask> {
  const res = await apiFetch("/api/tasks/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `create task failed: ${res.status}`);
  }
  return res.json();
}

export async function updateManualTask(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    status: ManualTaskStatus;
    priority: TaskPriority;
    due_date: string;
  }>,
): Promise<ManualTask> {
  const res = await apiFetch(`/api/tasks/manual/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update task failed: ${res.status}`);
  return res.json();
}

export async function toggleManualTaskDone(id: string): Promise<ManualTask> {
  const res = await apiFetch(`/api/tasks/manual/${id}/toggle`, { method: "POST" });
  if (!res.ok) throw new Error(`toggle failed: ${res.status}`);
  return res.json();
}

export async function deleteManualTask(id: string): Promise<void> {
  const res = await apiFetch(`/api/tasks/manual/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}

// ---- File summarization (real, server-side) ----
//
// Replaces the chat page's smartMockSummary canned text. Sends the
// raw upload to /api/files/summarize, which extracts text via pypdf /
// python-docx / utf-8 decode and runs the LLM. Returns markdown.

export interface FileSummaryResult {
  name: string;
  mime_type: string;
  size_bytes: number;
  extracted_chars: number;
  summary: string;
  extractor: string;
  truncated: boolean;
}

export async function summarizeFile(file: File): Promise<FileSummaryResult> {
  const form = new FormData();
  form.append("file", file);
  // Don't override Content-Type — the browser sets multipart boundary.
  const sessionToken =
    typeof document !== "undefined" ? readSessionToken() : "";
  const res = await fetch(`${API_BASE}/api/files/summarize`, {
    method: "POST",
    body: form,
    credentials: sessionToken ? "omit" : "include",
    headers: sessionToken ? { "X-Session-Token": sessionToken } : {},
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `summarize failed: ${res.status}`);
  }
  return res.json();
}

// ---- Feedback / suggestions ----
//
// Persisted to `feedback_submissions` on the backend. Anonymous-friendly:
// submitting from a logged-out tab still works (org_id/agent_id stay null).

export type FeedbackCategory = "bug" | "idea" | "praise" | "other";

export async function submitFeedback(payload: {
  category: FeedbackCategory;
  body: string;
  page_url?: string;
}): Promise<{ id: string; status: string }> {
  const res = await apiFetch("/api/feedback/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `feedback submit failed: ${res.status}`);
  }
  return res.json();
}

// ---- Capabilities (powers /settings/shadow) ----
//
// Three-state per-tool permissions, scoped to the caller's agent. The
// shadow-settings page calls these to render the connector-style toggle
// UI; runtime gates (e.g. attempt_auto_reply on the backend) consult
// the persisted permission before acting.

export type CapabilityPermission = "auto" | "ask" | "never";
export type CapabilityLane = "observation" | "soft" | "hard";
export type CapabilitySource = "default" | "user" | "learned";

export interface AgentCapability {
  tool_id: string;
  name: string;
  description: string;
  lane: CapabilityLane;
  default: CapabilityPermission;
  permission: CapabilityPermission;
  source: CapabilitySource;
  requires_integration: string | null;
  updated_at: string | null;
}

export async function fetchCapabilities(): Promise<AgentCapability[]> {
  const res = await apiFetch("/api/capabilities/");
  if (!res.ok) throw new Error(`capabilities fetch failed: ${res.status}`);
  const data = await res.json();
  return data.capabilities as AgentCapability[];
}

export async function setCapabilityPermission(
  toolId: string,
  permission: CapabilityPermission,
): Promise<AgentCapability> {
  const res = await apiFetch(`/api/capabilities/${toolId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permission }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `update failed: ${res.status}`);
  }
  return res.json();
}

// ---- Approvals (real, replaces lib/mocks::fetchApprovals) ----

import type {
  Approval,
  ExpertiseGraph,
  ExpertiseNode,
  ExpertiseEdge,
  ExpertiseNodeKind,
} from "@/lib/types";

interface ApprovalRequestRaw {
  id: string;
  requesting_agent: string;
  owning_agent: string;
  action: string;
  description: string;
  resource: string;
  status: "pending" | "approved" | "denied" | "expired";
  created_at: string;
}

// Fetches pending approvals for the caller's org and enriches them with
// requester/target names so the UI doesn't need a second round trip.
// Replaces the mock fetchApprovals in lib/mocks.
export async function fetchApprovals(): Promise<Approval[]> {
  const [pendingRes, agentsRes] = await Promise.all([
    apiFetch("/api/approvals/pending"),
    apiFetch("/api/agents/"),
  ]);
  if (!pendingRes.ok) throw new Error(`approvals fetch failed: ${pendingRes.status}`);
  const pending: ApprovalRequestRaw[] = await pendingRes.json();
  const agents: Array<{ id: string; name: string }> = agentsRes.ok
    ? await agentsRes.json()
    : [];
  const nameById = new Map(agents.map((a) => [a.id, a.name]));
  return pending.map((r) => ({
    id: r.id,
    requester_agent: r.requesting_agent,
    requester_name: nameById.get(r.requesting_agent) || "Unknown",
    target_agent: r.owning_agent,
    target_name: nameById.get(r.owning_agent) || "Unknown",
    resource: r.resource,
    context: r.description || undefined,
    status: r.status,
    verification: "verified",
    created_at: r.created_at,
  }));
}

// ---- Expertise graph (real, replaces lib/mocks::fetchExpertiseGraph) ----

interface GraphNodeRaw {
  id: string;
  node_type: string;
  name: string;
  attributes: Record<string, unknown>;
}

interface GraphEdgeRaw {
  id: string;
  from_id: string;
  to_id: string;
  edge_type: string;
  weight: number;
  attributes: Record<string, unknown>;
}

// Backend EdgeType → frontend's narrower 3-kind palette. Anything that
// isn't EXPERT_IN or COLLABORATED_WITH falls into MENTIONED so the
// renderer always has a label to draw.
function mapEdgeKind(t: string): "EXPERT_IN" | "COLLABORATED_WITH" | "MENTIONED" {
  if (t === "EXPERT_IN" || t === "WORKS_ON") return "EXPERT_IN";
  if (t === "COLLABORATED_WITH") return "COLLABORATED_WITH";
  return "MENTIONED";
}

function mapNodeKind(t: string): ExpertiseNodeKind {
  // ExpertiseNodeKind in lib/types is a string union — pass through the
  // backend node_type value verbatim. Renderer is forgiving on unknown kinds.
  return t as ExpertiseNodeKind;
}

export async function fetchExpertiseGraph(): Promise<ExpertiseGraph> {
  const [nodesRes, edgesRes] = await Promise.all([
    apiFetch("/api/graph/nodes?limit=500"),
    apiFetch("/api/graph/edges?limit=2000"),
  ]);
  if (!nodesRes.ok) throw new Error(`graph nodes fetch failed: ${nodesRes.status}`);
  if (!edgesRes.ok) throw new Error(`graph edges fetch failed: ${edgesRes.status}`);
  const rawNodes: GraphNodeRaw[] = await nodesRes.json();
  const rawEdges: GraphEdgeRaw[] = await edgesRes.json();

  const nodes: ExpertiseNode[] = rawNodes.map((n) => ({
    id: n.id,
    label: n.name,
    kind: mapNodeKind(n.node_type),
    weight:
      typeof n.attributes?.weight === "number"
        ? (n.attributes.weight as number)
        : undefined,
    department:
      typeof n.attributes?.department === "string"
        ? (n.attributes.department as string)
        : undefined,
  }));
  const edges: ExpertiseEdge[] = rawEdges.map((e) => ({
    source: e.from_id,
    target: e.to_id,
    kind: mapEdgeKind(e.edge_type),
    weight: e.weight,
  }));
  return { nodes, edges, generated_at: new Date().toISOString() };
}

// ---- File sharing between agents (in-band, no backend schema changes) ----
//
// `MessageLedgerRow` only has a `content` (text) column, so to ship real
// file payloads between two users without a backend migration we encode
// the file metadata (and base64 bytes for textual files within the size
// cap) into the body of a normal inter-agent message. The body keeps a
// human-readable preamble so the recipient's auto-reply LLM doesn't trip
// on a JSON-only blob, and the marker itself is stripped out at render
// time on the receiving side.

const FILE_MARKER_OPEN = "⟦file:RAVENHILL_V1⟧";
const FILE_MARKER_CLOSE = "⟦/file⟧";
const MAX_EMBEDDED_FILE_BYTES = 256 * 1024;

const TEXTUAL_API_MIME_PREFIXES = ["text/"];
const TEXTUAL_API_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/x-typescript",
  "application/sql",
]);
const TEXTUAL_API_EXTENSIONS = new Set([
  "md", "txt", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "htm",
  "css", "scss", "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java",
  "kt", "swift", "c", "h", "cpp", "hpp", "sh", "bash", "zsh", "sql",
  "ini", "cfg", "toml", "log", "rst", "tex",
]);

function isShareableAsText(mime: string, name: string): boolean {
  const m = (mime || "").toLowerCase();
  if (TEXTUAL_API_MIME_PREFIXES.some((p) => m.startsWith(p))) return true;
  if (TEXTUAL_API_MIME_EXACT.has(m)) return true;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return TEXTUAL_API_EXTENSIONS.has(ext);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface SharedFilePayload {
  id: string;
  name: string;
  mime: string;
  size: number;
  content_b64?: string;
  truncated?: boolean;
}

export interface ParsedFileMessage {
  preamble: string;
  attachment: {
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    url?: string;
    source: "shared";
  };
  truncated: boolean;
}

// Sends a file from the caller's agent to another agent through the same
// `/api/messages/agent` endpoint a normal text message uses. For textual
// files within `MAX_EMBEDDED_FILE_BYTES` the actual bytes ride along as
// base64; for binary or oversized files only the metadata travels and
// the recipient sees a "real bytes pending Drive ingestion" affordance.
export async function sendFileToAgent(
  toAgentId: string,
  attachment: {
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    url?: string;
  },
  note?: string,
): Promise<AgentLedgerMessage> {
  const payload: SharedFilePayload = {
    id: attachment.id,
    name: attachment.name,
    mime: attachment.mime_type || "application/octet-stream",
    size: attachment.size_bytes,
  };

  const canEmbed =
    !!attachment.url &&
    attachment.url.startsWith("blob:") &&
    isShareableAsText(attachment.mime_type, attachment.name) &&
    attachment.size_bytes <= MAX_EMBEDDED_FILE_BYTES;

  if (canEmbed) {
    try {
      const res = await fetch(attachment.url!);
      const blob = await res.blob();
      payload.content_b64 = await blobToBase64(blob);
    } catch {
      // Fall through with metadata-only — the recipient still sees the share.
    }
  } else if (attachment.size_bytes > MAX_EMBEDDED_FILE_BYTES) {
    payload.truncated = true;
  }

  const sizeKB = Math.max(1, Math.round(attachment.size_bytes / 1024));
  const preamble = note
    ? `Shared file: ${attachment.name} (${sizeKB} KB)\n\n${note}`
    : `Shared file: ${attachment.name} (${sizeKB} KB)`;
  const body = `${preamble}\n\n${FILE_MARKER_OPEN}${JSON.stringify(payload)}${FILE_MARKER_CLOSE}`;

  return sendAgentMessage(toAgentId, body, "file_share");
}

// Pulls the file payload back out of an inter-agent message body. Returns
// null when the body has no marker (i.e. it's a normal text message).
export function parseFileMarker(body: string): ParsedFileMessage | null {
  if (!body) return null;
  const open = body.indexOf(FILE_MARKER_OPEN);
  if (open < 0) return null;
  const close = body.indexOf(
    FILE_MARKER_CLOSE,
    open + FILE_MARKER_OPEN.length,
  );
  if (close < 0) return null;

  const json = body.slice(open + FILE_MARKER_OPEN.length, close);
  let payload: SharedFilePayload;
  try {
    payload = JSON.parse(json) as SharedFilePayload;
  } catch {
    return null;
  }
  if (!payload.name || typeof payload.size !== "number") return null;

  const mime = payload.mime || "application/octet-stream";
  const url = payload.content_b64
    ? `data:${mime};base64,${payload.content_b64}`
    : undefined;

  return {
    preamble: body.slice(0, open).trim(),
    truncated: !!payload.truncated,
    attachment: {
      id: payload.id || `shared-${Math.random().toString(36).slice(2)}`,
      name: payload.name,
      mime_type: mime,
      size_bytes: payload.size,
      url,
      source: "shared",
    },
  };
}

export async function markAgentMessageRead(ledgerId: string) {
  const res = await apiFetch(`/api/messages/${ledgerId}/read`, {
    method: "POST",
  });
  return res.json();
}

export async function submitApproval(approvalId: string, approved: boolean) {
  const res = await apiFetch(`/api/approvals/${approvalId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: approved ? "approved" : "denied" }),
  });
  return res.json();
}

export interface ApprovalAskTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ApprovalAskFallbackContext {
  requester_name?: string;
  target_name?: string;
  resource?: string;
  context?: string;
  status?: string;
  verification?: string;
  created_at?: string;
}

export async function askAboutApproval(params: {
  approvalId?: string;
  question: string;
  targetAgentId?: string;
  conversation?: ApprovalAskTurn[];
  fallbackContext?: ApprovalAskFallbackContext;
}): Promise<{ answer: string; used_real_db: boolean }> {
  const res = await apiFetch(`/api/approvals/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approval_id: params.approvalId ?? null,
      question: params.question,
      target_agent_id: params.targetAgentId ?? null,
      conversation: params.conversation ?? [],
      fallback_context: params.fallbackContext ?? null,
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `ask failed: ${res.status}`);
  }
  return res.json();
}

export async function orchestrate(agentId: string, message: string) {
  const res = await apiFetch(`/api/orchestrate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, agent_id: agentId }),
  });
  return res.json();
}

export async function completeDocRequest(approvalId: string) {
  const res = await apiFetch(
    `/api/orchestrate/approval/${approvalId}/complete`,
  );
  return res.json();
}

export async function resetDemo() {
  const res = await apiFetch(`/api/orchestrate/reset`, {
    method: "POST",
  });
  return res.json();
}

export async function fetchActivity(type?: string, limit?: number) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (limit) params.set("limit", String(limit));
  const res = await apiFetch(`/api/activity?${params}`);
  return res.json();
}

export async function fetchStats() {
  const res = await apiFetch(`/api/activity/stats`);
  return res.json();
}

export async function fetchHealth() {
  const res = await apiFetch(`/health`);
  return res.json();
}

// ---- Google Workspace (Calendar / Drive / Gmail) ----

export async function fetchWorkspaceCalendar(agentId?: string) {
  const params = agentId ? `?agent_id=${agentId}` : "";
  const res = await fetch(`${API_BASE}/api/workspace/calendar/events${params}`);
  if (!res.ok) throw new Error(`calendar fetch failed: ${res.status}`);
  return res.json();
}

export interface TriageItem {
  thread_id: string;
  subject: string;
  from: string;
  urgency: "now" | "today" | "this_week";
  reason: string;
  thread_url?: string | null;
}

export async function fetchInboxTriage(agentId?: string): Promise<{
  agent_id: string;
  items: TriageItem[];
  source: string;
}> {
  const params = agentId ? `?agent_id=${agentId}` : "";
  const res = await fetch(`${API_BASE}/api/workspace/gmail/triage${params}`);
  if (!res.ok) throw new Error(`triage fetch failed: ${res.status}`);
  return res.json();
}

export interface PreMeetingBrief {
  event: {
    id: string;
    title: string;
    start_time: string;
    attendees: string[];
    meeting_url?: string | null;
  };
  bullets: string[];
  related_threads: Array<{
    id: string;
    subject: string;
    from: string;
    thread_url?: string | null;
  }>;
  source: string;
}

export async function fetchPreMeetingBrief(
  eventId: string,
  agentId?: string,
): Promise<PreMeetingBrief> {
  const params = new URLSearchParams({ event_id: eventId });
  if (agentId) params.set("agent_id", agentId);
  const res = await fetch(
    `${API_BASE}/api/workspace/calendar/brief?${params}`,
  );
  if (!res.ok) throw new Error(`brief fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchWorkspaceDriveFiles(agentId?: string) {
  const params = agentId ? `?agent_id=${agentId}` : "";
  const res = await fetch(`${API_BASE}/api/workspace/drive/files${params}`);
  if (!res.ok) throw new Error(`drive files failed: ${res.status}`);
  return res.json();
}

export async function fetchWorkspaceDriveFolders(agentId?: string) {
  const params = agentId ? `?agent_id=${agentId}` : "";
  const res = await fetch(`${API_BASE}/api/workspace/drive/folders${params}`);
  if (!res.ok) throw new Error(`drive folders failed: ${res.status}`);
  return res.json();
}

export async function fetchGmailThreads(agentId?: string, limit = 25) {
  const params = new URLSearchParams();
  if (agentId) params.set("agent_id", agentId);
  params.set("limit", String(limit));
  const res = await fetch(`${API_BASE}/api/workspace/gmail/threads?${params}`);
  if (!res.ok) throw new Error(`gmail threads failed: ${res.status}`);
  return res.json();
}

export async function ingestGmailTopics(agentId?: string, limit = 25) {
  const params = new URLSearchParams();
  if (agentId) params.set("agent_id", agentId);
  params.set("limit", String(limit));
  const res = await fetch(`${API_BASE}/api/workspace/gmail/ingest?${params}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`gmail ingest failed: ${res.status}`);
  return res.json();
}

// ---- Google OAuth ----

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  agent_id: string;
  scopes: string[];
}

export async function fetchGoogleStatus(agentId?: string): Promise<GoogleStatus> {
  const params = agentId ? `?agent_id=${agentId}` : "";
  const res = await fetch(`${API_BASE}/api/workspace/google/status${params}`);
  if (!res.ok) throw new Error(`google status failed: ${res.status}`);
  return res.json();
}

export async function fetchGoogleAuthUrl(): Promise<{ auth_url: string }> {
  const res = await fetch(`${API_BASE}/api/workspace/google/auth-url`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `auth-url failed: ${res.status}`);
  }
  return res.json();
}

export async function submitGoogleCallback(code: string, agentId?: string) {
  const params = new URLSearchParams();
  params.set("code", code);
  if (agentId) params.set("agent_id", agentId);
  const res = await fetch(`${API_BASE}/api/workspace/google/callback?${params}`, {
    method: "POST",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `callback failed: ${res.status}`);
  }
  return res.json();
}

export async function disconnectGoogle(agentId?: string) {
  const params = agentId ? `?agent_id=${agentId}` : "";
  const res = await fetch(`${API_BASE}/api/workspace/google/disconnect${params}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`disconnect failed: ${res.status}`);
  return res.json();
}

// ============================================================
// Slack — OAuth + read endpoints
// ============================================================

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  team_id?: string | null;
  team_name?: string | null;
  scope?: string | null;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members: number;
  topic: string;
  purpose: string;
}

export interface SlackChannelMessage {
  ts: string;
  user: string | null;
  text: string;
  thread_ts?: string | null;
  reply_count: number;
  subtype?: string | null;
}

export async function fetchSlackStatus(agentId: string): Promise<SlackStatus> {
  const res = await fetch(
    `${API_BASE}/api/integrations/slack/status?agent_id=${encodeURIComponent(agentId)}`,
  );
  if (!res.ok) throw new Error(`slack status failed: ${res.status}`);
  return res.json();
}

export async function fetchSlackAuthUrl(
  agentId: string,
): Promise<{ auth_url: string }> {
  const res = await fetch(
    `${API_BASE}/api/integrations/slack/auth-url?agent_id=${encodeURIComponent(agentId)}`,
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `slack auth-url failed: ${res.status}`);
  }
  return res.json();
}

export async function submitSlackCallback(code: string, state: string) {
  const params = new URLSearchParams({ code, state });
  const res = await fetch(
    `${API_BASE}/api/integrations/slack/callback?${params}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `slack callback failed: ${res.status}`);
  }
  return res.json();
}

export async function disconnectSlack(agentId: string) {
  const res = await fetch(
    `${API_BASE}/api/integrations/slack/disconnect?agent_id=${encodeURIComponent(agentId)}`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`slack disconnect failed: ${res.status}`);
  return res.json();
}

export async function listSlackChannels(
  agentId: string,
  limit = 100,
): Promise<{ channels: SlackChannel[]; connected?: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/integrations/slack/channels?agent_id=${encodeURIComponent(agentId)}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`slack channels failed: ${res.status}`);
  return res.json();
}

export async function listSlackChannelMessages(
  agentId: string,
  channelId: string,
  limit = 30,
): Promise<{ messages: SlackChannelMessage[]; connected?: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE}/api/integrations/slack/channels/${encodeURIComponent(channelId)}/messages?agent_id=${encodeURIComponent(agentId)}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`slack messages failed: ${res.status}`);
  return res.json();
}

/**
 * Subscribe to real-time activity events via SSE.
 * Returns a cleanup function to close the connection.
 */
export function streamActivity(
  onEvent: (entry: Record<string, unknown>) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/api/activity/stream`, {
    withCredentials: true,
  });
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type !== "ping") onEvent(data);
    } catch {
      /* skip malformed */
    }
  };
  es.onerror = () => {
    es.close();
  };
  return () => es.close();
}

// ---- Meetings API ----

export interface MeetingTask {
  id: string;
  meeting_id: string;
  agent_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  source_excerpt?: string;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MeetingFile {
  id: string;
  meeting_id: string;
  filename: string;
  description?: string;
  file_url?: string;
}

export interface Meeting {
  id: string;
  agent_id: string;
  title: string;
  summary?: string;
  source: string;
  status: string;
  tasks: MeetingTask[];
  files: MeetingFile[];
  created_at?: string;
  updated_at?: string;
}

export interface GoogleMeeting {
  event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees: string[];
  has_transcript: boolean;
}

export async function createMeeting(data: {
  title: string;
  raw_transcript: string;
  agent_id: string;
  source?: string;
}): Promise<Meeting> {
  const res = await apiFetch(`/api/meetings/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create meeting failed: ${res.status}`);
  return res.json();
}

export async function fetchMeetings(agentId?: string): Promise<Meeting[]> {
  const params = new URLSearchParams();
  if (agentId) params.set("agent_id", agentId);
  const res = await apiFetch(`/api/meetings/?${params}`);
  return res.json();
}

export async function fetchMeeting(meetingId: string): Promise<Meeting> {
  const res = await apiFetch(`/api/meetings/${meetingId}`);
  if (!res.ok) throw new Error(`Fetch meeting failed: ${res.status}`);
  return res.json();
}

export async function updateTask(
  meetingId: string,
  taskId: string,
  updates: { status?: string; priority?: string; title?: string; description?: string },
): Promise<MeetingTask> {
  const res = await apiFetch(`/api/meetings/${meetingId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update task failed: ${res.status}`);
  return res.json();
}

export async function getTaskHelp(
  meetingId: string,
  taskId: string,
  question?: string,
): Promise<{ task_id: string; response: string }> {
  const res = await apiFetch(`/api/meetings/${meetingId}/tasks/${taskId}/help`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`Task help failed: ${res.status}`);
  return res.json();
}

export async function deleteMeeting(meetingId: string) {
  const res = await apiFetch(`/api/meetings/${meetingId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete meeting failed: ${res.status}`);
  return res.json();
}

export async function fetchGoogleMeetings(agentId: string): Promise<GoogleMeeting[]> {
  const res = await apiFetch(`/api/meetings/google/meetings?agent_id=${agentId}`);
  if (!res.ok) throw new Error(`Fetch Google meetings failed: ${res.status}`);
  return res.json();
}

export async function importGoogleMeeting(agentId: string, eventId: string): Promise<Meeting> {
  const res = await apiFetch(`/api/meetings/google/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, calendar_event_id: eventId }),
  });
  if (!res.ok) throw new Error(`Import Google meeting failed: ${res.status}`);
  return res.json();
}

/**
 * Stream orchestration via SSE. Calls the callback for each parsed event.
 *
 * Event shapes:
 *   { type: "session", session_id: string }
 *   { type: "step", step: { label, status, detail } }
 *   { type: "chunk", text: string }
 *   { type: "sources", sources: string[] }
 *   { type: "second_hop", available: boolean, agent_id: string, hint: string }
 *   { type: "approval", approval_id: string, target_name: string }
 *   { type: "done", trace_id: string }
 */
export async function orchestrateStream(
  agentId: string,
  message: string,
  sessionId: string | null,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const res = await apiFetch(`/api/orchestrate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      agent_id: agentId,
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    throw new Error(`Stream request failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(data);
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}

/**
 * Stream a second-hop query via SSE.
 */
export async function secondHopStream(
  agentId: string,
  referencedAgentId: string,
  originalQuestion: string,
  followUp: string,
  sessionId: string | null,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const res = await apiFetch(`/api/orchestrate/second-hop/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      referenced_agent_id: referencedAgentId,
      original_question: originalQuestion,
      follow_up: followUp,
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    throw new Error(`Second-hop stream failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(data);
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}
