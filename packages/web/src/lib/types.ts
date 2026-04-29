/**
 * V1 contract types — the source of truth for frontend/backend alignment.
 *
 * Convention:
 *   LIVE   → backend already exposes this (see packages/api/)
 *   STUB   → frontend mocks only; backend endpoint TBD (coordinate w/ Muhammad)
 *   EXTEND → backend has a partial shape; V1 adds fields
 */

// ============================================================
// Shared primitives
// ============================================================

export type Priority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done";
export type VerificationStatus = "verified" | "inferred" | "unverified";
export type ReadyState = "ready" | "not_ready";

export interface Timestamped {
  created_at: string;
  updated_at?: string;
}

// ============================================================
// Agents & People (LIVE, see packages/api/agents/models.py)
// ============================================================

export type Seniority = "junior" | "mid" | "senior" | "lead" | "exec";

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
  role_description?: string;
  departments: string[];
  trust_level: "auto" | "notify" | "approve";
  // Drives tier-aware routing on the backend; surfaced as a small badge
  // in People lists so the user can see who their agent will/won't ping.
  seniority?: Seniority;
  is_active: boolean;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatar_url?: string;
  agent_id?: string;
}

// ============================================================
// Pending items — dashboard to-do + board (STUB)
// Single endpoint, grouped client-side. Priority as chip, status as column.
// ============================================================

export interface PendingItem extends Timestamped {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  source: "agent_detected" | "manual" | "meeting" | "message";
  source_ref?: string;
  assigned_to?: string;
  due_date?: string;
  lifespan_days?: number;
  ready_state: ReadyState;
}

export function isStale(item: PendingItem, now = new Date()): boolean {
  if (!item.lifespan_days || !item.updated_at) return false;
  const age = (now.getTime() - new Date(item.updated_at).getTime()) / 86400000;
  return age > item.lifespan_days;
}

// ============================================================
// Approvals (EXTEND — backend has basic approval, V1 adds context)
// ============================================================

export interface Approval extends Timestamped {
  id: string;
  requester_agent: string;
  requester_name: string;
  target_agent: string;
  target_name: string;
  resource: string;
  context?: string;
  status: "pending" | "approved" | "denied" | "expired";
  verification: VerificationStatus;
}

// ============================================================
// Notifications — action-first, visual verification (STUB)
// ============================================================

export interface NotificationItem extends Timestamped {
  id: string;
  action: string;
  change_summary: string;
  actor?: string;
  source?: string;
  verification: VerificationStatus;
  read: boolean;
  href?: string;
}

// ============================================================
// Activity feed — proactive surfacing lane + routing steps (EXTEND SSE)
// Piggyback on /api/orchestrate/stream and /api/activity/stream.
// Add proactive event types to the existing SSE event union.
// ============================================================

export type ActivityEventType =
  | "routing_step"
  | "verification"
  | "agent_reasoning"
  | "proactive_surface"
  | "decision_detected"
  | "staleness_flag";

export interface ActivityEvent extends Timestamped {
  id: string;
  type: ActivityEventType;
  label: string;
  detail?: string;
  agent_id?: string;
  verification?: VerificationStatus;
  meta?: Record<string, unknown>;
}

// ============================================================
// Expertise map (STUB — new /api/graph/topology endpoint needed)
// Force-directed graph: nodes = people/topics, edges = EXPERT_IN weight
// ============================================================

export type ExpertiseNodeKind = "person" | "topic";

export interface ExpertiseNode {
  id: string;
  label: string;
  kind: ExpertiseNodeKind;
  weight?: number;
  department?: string;
}

export interface ExpertiseEdge {
  source: string;
  target: string;
  kind: "EXPERT_IN" | "COLLABORATED_WITH" | "MENTIONED";
  weight: number;
  weight_history?: Array<{ ts: string; weight: number }>;
}

export interface ExpertiseGraph {
  nodes: ExpertiseNode[];
  edges: ExpertiseEdge[];
  generated_at: string;
}

// ============================================================
// Shadow profile (STUB — read-only for V1)
// ============================================================

export interface ShadowProfile {
  user_id: string;
  top_topics: Array<{ topic: string; weight: number }>;
  response_patterns: {
    avg_response_minutes: number;
    preferred_channels: Array<{ channel: string; share: number }>;
    active_hours: { start_hour: number; end_hour: number };
  };
  collaboration: Array<{ person_id: string; person_name: string; strength: number }>;
  generated_at: string;
  note: "Shadow profiles are user-only. Not visible to managers or admins.";
}

// ============================================================
// Permissions (STUB — persist now; coordinate schema w/ Muhammad)
// ============================================================

export type PermissionScopeKind =
  | "team"
  | "topic"
  | "person"
  | "classification"
  | "external";

export type PermissionMode = "standing" | "on_demand";

export interface Permission extends Timestamped {
  id: string;
  user_id: string;
  scope_kind: PermissionScopeKind;
  scope_value: string;
  mode: PermissionMode;
  allow: boolean;
  default_ready_state: ReadyState;
  expires_at?: string;
  note?: string;
}

// ============================================================
// Calendar + Google Workspace (EXTEND — backend has Google Meet partial)
// ============================================================

export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees: string[];
  location?: string;
  source: "google_calendar" | "manual" | "outlook";
  has_transcript?: boolean;
  meeting_url?: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  mime_type: string;
  owner: string;
  last_modified: string;
  url: string;
  source: "google_drive" | "gmail_attachment";
}

export interface WorkspaceEmail {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  received_at: string;
  unread: boolean;
  thread_url: string;
}

// ============================================================
// Admin dashboard (STUB — org-level only, no per-user data)
// ============================================================

export interface AdminOrgStats {
  total_users: number;
  active_users_24h: number;
  active_agents: number;
  ingestion: {
    slack_events_24h: number;
    gmail_events_24h: number;
    calendar_events_24h: number;
    last_sync_at: string;
  };
  graph: {
    nodes: number;
    edges: number;
    topics: number;
  };
  approvals: {
    pending: number;
    resolved_24h: number;
    avg_resolution_minutes: number;
  };
}

// ============================================================
// Slack surface (STUB — frontend mocks; real OAuth pending)
// ============================================================

export type SlackChannelKind = "channel" | "dm" | "group_dm";

export interface SlackChannel {
  id: string;
  name: string;
  kind: SlackChannelKind;
  members?: string[];
  unread: number;
  last_message_at?: string;
  is_private?: boolean;
}

export interface SlackMessage {
  id: string;
  channel_id: string;
  author: string;
  author_avatar?: string;
  text: string;
  timestamp: string;
  reactions?: Array<{ emoji: string; count: number }>;
  thread_reply_count?: number;
}

// ============================================================
// Chat attachments + file summaries (STUB)
// Files can be attached to messages in either direction. The
// receiving agent returns a structured summary; both directions
// render as a small file card inside the message bubble.
// ============================================================

export interface ChatAttachment {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  url?: string;
  source: "upload" | "agent_reply" | "drive" | "slack" | "shared";
}

export interface FileSummary {
  attachment_id: string;
  title: string;
  one_liner: string;
  contributors: Array<{ name: string; did: string }>;
  action_items: Array<{ owner: string; task: string; due?: string }>;
  open_questions?: string[];
  generated_at: string;
}

// ============================================================
// Meeting providers (STUB — deep-link only, no API creation)
// ============================================================

export type MeetingProvider = "google_meet" | "zoom";

export interface MeetingProviderLinks {
  provider: MeetingProvider;
  start_instant: string;
  create_for_later: string;
  join_root: string;
}

// ============================================================
// Onboarding (STUB — inference-first, HRIS deferred)
// ============================================================

export type OnboardingStep =
  | "welcome"
  | "connect_comms"
  | "inference_preview"
  | "calibrate"
  | "permissions_default"
  | "done";

export interface OnboardingState {
  user_id: string;
  current_step: OnboardingStep;
  connected_sources: Array<"slack" | "gmail" | "google_calendar" | "drive">;
  inferred_org_ready: boolean;
  calibration: {
    confirmed_team?: string;
    confirmed_role?: string;
    top_collaborators?: string[];
  };
}
