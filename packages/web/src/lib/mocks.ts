/**
 * Mock fixtures + mock fetchers for V1 surfaces whose backend is TBD.
 *
 * Rule: when Muhammad ships a real endpoint, move the fetcher to api.ts and
 * delete the mock entry below. Types in types.ts stay put.
 */

import type {
  AdminOrgStats,
  Approval,
  CalendarEvent,
  ExpertiseGraph,
  NotificationItem,
  OnboardingState,
  PendingItem,
  Permission,
  ShadowProfile,
  WorkspaceEmail,
  WorkspaceFile,
} from "./types";

const now = new Date().toISOString();
const daysAgo = (d: number) =>
  new Date(Date.now() - d * 86400000).toISOString();

// ------------------------------------------------------------
// Pending items — feeds to-do view + board view (grouped client-side)
// ------------------------------------------------------------

export const mockPendingItems: PendingItem[] = [
  {
    id: "p1",
    title: "Confirm Q2 pricing deck ownership",
    description: "Jordan asked who owns the pricing deck; unclear from last sync.",
    status: "todo",
    priority: "high",
    source: "agent_detected",
    due_date: daysAgo(-2),
    lifespan_days: 5,
    ready_state: "not_ready",
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  },
  {
    id: "p2",
    title: "Review Slack adapter token rotation plan",
    status: "in_progress",
    priority: "high",
    source: "meeting",
    source_ref: "meeting_42",
    lifespan_days: 3,
    ready_state: "ready",
    created_at: daysAgo(2),
    updated_at: daysAgo(1),
  },
  {
    id: "p3",
    title: "Reply to Karen re: focus group export format",
    status: "todo",
    priority: "medium",
    source: "message",
    lifespan_days: 4,
    ready_state: "ready",
    created_at: daysAgo(3),
    updated_at: daysAgo(3),
  },
  {
    id: "p4",
    title: "Archive old onboarding docs",
    status: "todo",
    priority: "low",
    source: "manual",
    ready_state: "ready",
    created_at: daysAgo(10),
    updated_at: daysAgo(10),
    lifespan_days: 7,
  },
  {
    id: "p5",
    title: "Ship design tokens migration",
    status: "done",
    priority: "medium",
    source: "manual",
    ready_state: "ready",
    created_at: daysAgo(6),
    updated_at: daysAgo(1),
  },
  {
    id: "p6",
    title: "Draft permissions schema with CTO",
    status: "in_progress",
    priority: "high",
    source: "manual",
    lifespan_days: 2,
    ready_state: "not_ready",
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  },
];

export async function fetchPendingItems(): Promise<PendingItem[]> {
  return Promise.resolve(mockPendingItems);
}

// ------------------------------------------------------------
// Approvals — inbox of pending/resolved approvals
// ------------------------------------------------------------

export const mockApprovals: Approval[] = [
  {
    id: "a1",
    requester_agent: "agt_sales",
    requester_name: "Jordan Chen",
    target_agent: "agt_me",
    target_name: "You",
    resource: "Q4 burn-rate snapshot",
    context:
      "Sales deck for SLS needs the current quarter burn number. Not ready until CFO signs off.",
    status: "pending",
    verification: "inferred",
    created_at: daysAgo(0.1),
  },
  {
    id: "a2",
    requester_agent: "agt_product",
    requester_name: "Marco Li",
    target_agent: "agt_me",
    target_name: "You",
    resource: "Focus group export (raw)",
    context: "Marco's agent wants the unredacted focus group raw notes.",
    status: "pending",
    verification: "verified",
    created_at: daysAgo(0.5),
  },
  {
    id: "a3",
    requester_agent: "agt_eng",
    requester_name: "Priya Shah",
    target_agent: "agt_me",
    target_name: "You",
    resource: "Slack adapter design doc",
    context: "Internal design review.",
    status: "approved",
    verification: "verified",
    created_at: daysAgo(1.3),
  },
  {
    id: "a4",
    requester_agent: "agt_sales",
    requester_name: "Jordan Chen",
    target_agent: "agt_me",
    target_name: "You",
    resource: "Legal draft — pricing page",
    context: "Waiting on legal review; denied until signed off.",
    status: "denied",
    verification: "unverified",
    created_at: daysAgo(2),
  },
];

export async function fetchApprovals(): Promise<Approval[]> {
  return Promise.resolve(mockApprovals);
}

// ------------------------------------------------------------
// Notifications
// ------------------------------------------------------------

export const mockNotifications: NotificationItem[] = [
  {
    id: "n1",
    action: "Decision detected",
    change_summary: "Q2 pricing deck owner set to Karen Park",
    actor: "Jordan Chen",
    source: "slack #pricing",
    verification: "inferred",
    read: false,
    href: "/dashboard",
    created_at: daysAgo(0.1),
  },
  {
    id: "n2",
    action: "Stale item",
    change_summary: "Focus group export request has exceeded 4-day lifespan",
    verification: "verified",
    read: false,
    href: "/dashboard",
    created_at: daysAgo(0.5),
  },
  {
    id: "n3",
    action: "Routed to you",
    change_summary: "Finance question about burn rate from Sales agent",
    actor: "Jordan Chen",
    verification: "verified",
    read: true,
    href: "/chat",
    created_at: daysAgo(1),
  },
];

export async function fetchNotifications(): Promise<NotificationItem[]> {
  return Promise.resolve(mockNotifications);
}

// ------------------------------------------------------------
// Expertise graph (topology)
// ------------------------------------------------------------

export const mockExpertiseGraph: ExpertiseGraph = {
  generated_at: now,
  nodes: [
    { id: "u1", label: "Karen Park", kind: "person", department: "Finance" },
    { id: "u2", label: "Jordan Chen", kind: "person", department: "Sales" },
    { id: "u3", label: "Priya Shah", kind: "person", department: "Engineering" },
    { id: "u4", label: "Marco Li", kind: "person", department: "Product" },
    { id: "t1", label: "pricing", kind: "topic", weight: 0.9 },
    { id: "t2", label: "burn rate", kind: "topic", weight: 0.8 },
    { id: "t3", label: "slack adapter", kind: "topic", weight: 0.7 },
    { id: "t4", label: "focus groups", kind: "topic", weight: 0.6 },
  ],
  edges: [
    { source: "u1", target: "t1", kind: "EXPERT_IN", weight: 0.9 },
    { source: "u1", target: "t2", kind: "EXPERT_IN", weight: 0.95 },
    { source: "u2", target: "t1", kind: "EXPERT_IN", weight: 0.5 },
    { source: "u3", target: "t3", kind: "EXPERT_IN", weight: 0.9 },
    { source: "u4", target: "t4", kind: "EXPERT_IN", weight: 0.8 },
    { source: "u2", target: "u1", kind: "COLLABORATED_WITH", weight: 0.7 },
    { source: "u3", target: "u4", kind: "COLLABORATED_WITH", weight: 0.6 },
  ],
};

export async function fetchExpertiseGraph(): Promise<ExpertiseGraph> {
  return Promise.resolve(mockExpertiseGraph);
}

// ------------------------------------------------------------
// Shadow profile (read-only)
// ------------------------------------------------------------

export const mockShadowProfile: ShadowProfile = {
  user_id: "me",
  generated_at: now,
  top_topics: [
    { topic: "permissions", weight: 0.85 },
    { topic: "design system", weight: 0.7 },
    { topic: "onboarding", weight: 0.55 },
  ],
  response_patterns: {
    avg_response_minutes: 42,
    preferred_channels: [
      { channel: "slack", share: 0.6 },
      { channel: "email", share: 0.3 },
      { channel: "calendar", share: 0.1 },
    ],
    active_hours: { start_hour: 9, end_hour: 19 },
  },
  collaboration: [
    { person_id: "u1", person_name: "Karen Park", strength: 0.6 },
    { person_id: "u3", person_name: "Priya Shah", strength: 0.8 },
  ],
  note: "Shadow profiles are user-only. Not visible to managers or admins.",
};

export async function fetchShadowProfile(): Promise<ShadowProfile> {
  return Promise.resolve(mockShadowProfile);
}

// ------------------------------------------------------------
// Permissions
// ------------------------------------------------------------

export const mockPermissions: Permission[] = [
  {
    id: "perm1",
    user_id: "me",
    scope_kind: "team",
    scope_value: "Finance",
    mode: "standing",
    allow: true,
    default_ready_state: "not_ready",
    created_at: daysAgo(14),
  },
  {
    id: "perm2",
    user_id: "me",
    scope_kind: "topic",
    scope_value: "burn rate",
    mode: "standing",
    allow: false,
    default_ready_state: "not_ready",
    note: "Only after CFO sign-off",
    created_at: daysAgo(7),
  },
  {
    id: "perm3",
    user_id: "me",
    scope_kind: "classification",
    scope_value: "confidential",
    mode: "on_demand",
    allow: false,
    default_ready_state: "not_ready",
    created_at: daysAgo(3),
  },
];

export async function fetchPermissions(): Promise<Permission[]> {
  return Promise.resolve(mockPermissions);
}

// ------------------------------------------------------------
// Calendar + Google Workspace (dashboard tab)
// ------------------------------------------------------------

export const mockCalendarEvents: CalendarEvent[] = [
  {
    id: "ev1",
    title: "Weekly sync w/ Muhammad",
    start_time: daysAgo(-0.2),
    end_time: daysAgo(-0.15),
    attendees: ["muhammad@e-agent.ai", "me@e-agent.ai"],
    source: "google_calendar",
    meeting_url: "https://meet.google.com/abc-defg-hij",
  },
  {
    id: "ev2",
    title: "SLS design partner kickoff",
    start_time: daysAgo(-1),
    end_time: daysAgo(-0.95),
    attendees: ["team@sls.com", "max@e-agent.ai"],
    source: "google_calendar",
    has_transcript: true,
  },
  {
    id: "ev3",
    title: "V1 scope review",
    start_time: daysAgo(-2),
    end_time: daysAgo(-1.95),
    attendees: ["max@e-agent.ai", "muhammad@e-agent.ai", "me@e-agent.ai"],
    source: "google_calendar",
  },
];

export const mockWorkspaceFiles: WorkspaceFile[] = [
  {
    id: "f1",
    name: "V1 Implementation Plan.md",
    mime_type: "text/markdown",
    owner: "max@e-agent.ai",
    last_modified: daysAgo(0.3),
    url: "#",
    source: "google_drive",
  },
  {
    id: "f2",
    name: "SLS Onboarding Checklist.gdoc",
    mime_type: "application/vnd.google-apps.document",
    owner: "max@e-agent.ai",
    last_modified: daysAgo(1.2),
    url: "#",
    source: "google_drive",
  },
  {
    id: "f3",
    name: "Permissions schema draft.md",
    mime_type: "text/markdown",
    owner: "muhammad@e-agent.ai",
    last_modified: daysAgo(0.7),
    url: "#",
    source: "google_drive",
  },
];

export const mockWorkspaceEmails: WorkspaceEmail[] = [
  {
    id: "e1",
    subject: "Re: V1 scope — SLS deployment",
    from: "max@e-agent.ai",
    snippet: "Pushed the deadline by a week after the design partner call...",
    received_at: daysAgo(0.1),
    unread: true,
    thread_url: "#",
  },
  {
    id: "e2",
    subject: "Permissions schema — first pass",
    from: "muhammad@e-agent.ai",
    snippet: "Here's the ERD; let me know what the UI needs before I migrate.",
    received_at: daysAgo(0.5),
    unread: true,
    thread_url: "#",
  },
];

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  return Promise.resolve(mockCalendarEvents);
}

export async function fetchWorkspaceFiles(): Promise<WorkspaceFile[]> {
  return Promise.resolve(mockWorkspaceFiles);
}

export async function fetchWorkspaceEmails(): Promise<WorkspaceEmail[]> {
  return Promise.resolve(mockWorkspaceEmails);
}

// ------------------------------------------------------------
// Admin (org-level)
// ------------------------------------------------------------

export const mockAdminStats: AdminOrgStats = {
  total_users: 61,
  active_users_24h: 44,
  active_agents: 58,
  ingestion: {
    slack_events_24h: 3240,
    gmail_events_24h: 890,
    calendar_events_24h: 72,
    last_sync_at: daysAgo(0.02),
  },
  graph: { nodes: 1842, edges: 5730, topics: 214 },
  approvals: { pending: 6, resolved_24h: 31, avg_resolution_minutes: 18 },
};

export async function fetchAdminStats(): Promise<AdminOrgStats> {
  return Promise.resolve(mockAdminStats);
}

// ------------------------------------------------------------
// Onboarding
// ------------------------------------------------------------

export const mockOnboardingState: OnboardingState = {
  user_id: "me",
  current_step: "welcome",
  connected_sources: [],
  inferred_org_ready: false,
  calibration: {},
};

export async function fetchOnboardingState(): Promise<OnboardingState> {
  return Promise.resolve(mockOnboardingState);
}
