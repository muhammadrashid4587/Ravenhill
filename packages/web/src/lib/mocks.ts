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
  SlackChannel,
  SlackMessage,
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
  return Promise.resolve([...mockNotifications]);
}

export async function markNotificationRead(
  id: string,
  read = true,
): Promise<NotificationItem | null> {
  const idx = mockNotifications.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  mockNotifications[idx] = { ...mockNotifications[idx], read };
  return Promise.resolve(mockNotifications[idx]);
}

export async function markAllNotificationsRead(): Promise<number> {
  let count = 0;
  mockNotifications.forEach((n) => {
    if (!n.read) {
      n.read = true;
      count += 1;
    }
  });
  return Promise.resolve(count);
}

export async function setOnboardingState(
  next: Partial<OnboardingState>,
): Promise<OnboardingState> {
  Object.assign(mockOnboardingState, next);
  return Promise.resolve({ ...mockOnboardingState });
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
  return Promise.resolve([...mockPermissions]);
}

// Mock persistence — replace with real POST/PATCH/DELETE when Muhammad's
// migration lands. Contract to coordinate on:
//   POST   /api/permissions         body: Omit<Permission, "id"|"created_at">
//   PATCH  /api/permissions/:id     body: Partial<Permission>
//   DELETE /api/permissions/:id

export async function createPermission(
  draft: Omit<Permission, "id" | "created_at">,
): Promise<Permission> {
  const row: Permission = {
    ...draft,
    id: `perm_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  mockPermissions.push(row);
  return Promise.resolve(row);
}

export async function updatePermission(
  id: string,
  patch: Partial<Omit<Permission, "id" | "user_id" | "created_at">>,
): Promise<Permission | null> {
  const idx = mockPermissions.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  mockPermissions[idx] = {
    ...mockPermissions[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  return Promise.resolve(mockPermissions[idx]);
}

export async function deletePermission(id: string): Promise<boolean> {
  const idx = mockPermissions.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  mockPermissions.splice(idx, 1);
  return Promise.resolve(true);
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
  {
    id: "f4",
    name: "Q2 Pricing Deck.gslides",
    mime_type: "application/vnd.google-apps.presentation",
    owner: "karen@e-agent.ai",
    last_modified: daysAgo(0.4),
    url: "#",
    source: "google_drive",
  },
  {
    id: "f5",
    name: "Focus group raw export.csv",
    mime_type: "text/csv",
    owner: "marco@e-agent.ai",
    last_modified: daysAgo(2.1),
    url: "#",
    source: "google_drive",
  },
  {
    id: "f6",
    name: "Board memo - April 2026.gdoc",
    mime_type: "application/vnd.google-apps.document",
    owner: "max@e-agent.ai",
    last_modified: daysAgo(4),
    url: "#",
    source: "google_drive",
  },
  {
    id: "f7",
    name: "SLS Demo Recording.mp4",
    mime_type: "video/mp4",
    owner: "likitha@e-agent.ai",
    last_modified: daysAgo(1.8),
    url: "#",
    source: "google_drive",
  },
];

export interface DriveFolder {
  id: string;
  name: string;
  file_ids: string[];
  shared_with?: string[];
}

export const mockDriveFolders: DriveFolder[] = [
  { id: "root", name: "My Drive", file_ids: ["f1", "f2", "f3", "f4", "f5", "f6", "f7"] },
  { id: "shared", name: "Shared with me", file_ids: ["f4", "f5"], shared_with: ["karen@e-agent.ai", "marco@e-agent.ai"] },
  { id: "starred", name: "Starred", file_ids: ["f1", "f4"] },
  { id: "recent", name: "Recent", file_ids: ["f1", "f7", "f2", "f3"] },
  { id: "meet", name: "Meet Recordings", file_ids: ["f7"] },
];

export async function fetchDriveFolders(agentId?: string): Promise<DriveFolder[]> {
  try {
    const { fetchWorkspaceDriveFolders } = await import("./api");
    const res = await fetchWorkspaceDriveFolders(agentId);
    if (Array.isArray(res)) return res as DriveFolder[];
  } catch {
    /* fall through */
  }
  return mockDriveFolders;
}

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

// These three prefer the live backend when it's up; fall back to the canned
// fixtures above so the frontend never breaks mid-demo. Once every consumer
// is ported to api.ts directly, the seed constants can be deleted.
export async function fetchCalendarEvents(agentId?: string): Promise<CalendarEvent[]> {
  try {
    const { fetchWorkspaceCalendar } = await import("./api");
    const res = await fetchWorkspaceCalendar(agentId);
    if (Array.isArray(res)) return res as CalendarEvent[];
  } catch {
    /* fall through */
  }
  return mockCalendarEvents;
}

export async function fetchWorkspaceFiles(agentId?: string): Promise<WorkspaceFile[]> {
  try {
    const { fetchWorkspaceDriveFiles } = await import("./api");
    const res = await fetchWorkspaceDriveFiles(agentId);
    if (Array.isArray(res)) return res as WorkspaceFile[];
  } catch {
    /* fall through */
  }
  return mockWorkspaceFiles;
}

export async function fetchWorkspaceEmails(agentId?: string): Promise<WorkspaceEmail[]> {
  try {
    const { fetchGmailThreads } = await import("./api");
    const res = await fetchGmailThreads(agentId);
    if (Array.isArray(res)) return res as WorkspaceEmail[];
  } catch {
    /* fall through */
  }
  return mockWorkspaceEmails;
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
// Slack (channels, DMs, threaded messages)
// ------------------------------------------------------------

export const mockSlackChannels: SlackChannel[] = [
  {
    id: "C_GENERAL",
    name: "general",
    kind: "channel",
    unread: 0,
    last_message_at: daysAgo(0.05),
  },
  {
    id: "C_ENG",
    name: "eng",
    kind: "channel",
    unread: 3,
    last_message_at: daysAgo(0.02),
  },
  {
    id: "C_PRICING",
    name: "pricing",
    kind: "channel",
    unread: 1,
    last_message_at: daysAgo(0.3),
    is_private: true,
  },
  {
    id: "C_SLS",
    name: "sls-launch",
    kind: "channel",
    unread: 5,
    last_message_at: daysAgo(0.01),
  },
  {
    id: "DM_MUHAMMAD",
    name: "Muhammad Rashid",
    kind: "dm",
    unread: 2,
    last_message_at: daysAgo(0.04),
  },
  {
    id: "DM_MAX",
    name: "Max Ravenhill",
    kind: "dm",
    unread: 0,
    last_message_at: daysAgo(0.6),
  },
  {
    id: "DM_KAREN",
    name: "Karen Park",
    kind: "dm",
    unread: 1,
    last_message_at: daysAgo(0.9),
  },
];

const slackThreads: Record<string, SlackMessage[]> = {
  C_ENG: [
    {
      id: "sm1",
      channel_id: "C_ENG",
      author: "Muhammad Rashid",
      text: "Just pushed the Alembic migration for `users` + `oauth_tokens`. Can someone review before I run it against the dev db?",
      timestamp: daysAgo(0.1),
      reactions: [{ emoji: "👀", count: 2 }],
      thread_reply_count: 4,
    },
    {
      id: "sm2",
      channel_id: "C_ENG",
      author: "Priya Shah",
      text: "On it — give me 20m.",
      timestamp: daysAgo(0.09),
    },
    {
      id: "sm3",
      channel_id: "C_ENG",
      author: "Muhammad Rashid",
      text: "Also: Slack adapter token encryption needs a decision on KMS vs. Fernet. Leaning Fernet for V1, KMS when we have more budget.",
      timestamp: daysAgo(0.02),
      reactions: [{ emoji: "✅", count: 1 }],
    },
  ],
  C_SLS: [
    {
      id: "sm4",
      channel_id: "C_SLS",
      author: "Max Ravenhill",
      text: "SLS admin just provisioned 30 seats. We're a go for the 2026-06-01 target.",
      timestamp: daysAgo(0.5),
      reactions: [{ emoji: "🎉", count: 4 }, { emoji: "🚀", count: 2 }],
    },
    {
      id: "sm5",
      channel_id: "C_SLS",
      author: "Likitha Kamble",
      text: "Three-panel chat is wired up with mocks. Slack tab + file upload going in next.",
      timestamp: daysAgo(0.02),
    },
    {
      id: "sm6",
      channel_id: "C_SLS",
      author: "Max Ravenhill",
      text: "Love it. Make sure the file drop flow can handle the Q2 PRD — that's what I'll show the design partner first.",
      timestamp: daysAgo(0.01),
    },
  ],
  C_PRICING: [
    {
      id: "sm7",
      channel_id: "C_PRICING",
      author: "Jordan Chen",
      text: "Who owns the Q2 pricing deck? Karen, is that still you?",
      timestamp: daysAgo(0.4),
    },
    {
      id: "sm8",
      channel_id: "C_PRICING",
      author: "Karen Park",
      text: "Yes — I'll have a revised draft by EOW.",
      timestamp: daysAgo(0.3),
      reactions: [{ emoji: "🙏", count: 1 }],
    },
  ],
  C_GENERAL: [
    {
      id: "sm9",
      channel_id: "C_GENERAL",
      author: "Max Ravenhill",
      text: "Reminder: sprint demo Friday 3pm. Everyone ships something.",
      timestamp: daysAgo(0.05),
    },
  ],
  DM_MUHAMMAD: [
    {
      id: "sm10",
      channel_id: "DM_MUHAMMAD",
      author: "Muhammad Rashid",
      text: "Hey — before you wire up the Slack tab, can we lock the channel schema? I want to make sure `unread` counts match what the adapter will actually emit.",
      timestamp: daysAgo(0.05),
    },
    {
      id: "sm11",
      channel_id: "DM_MUHAMMAD",
      author: "Muhammad Rashid",
      text: "Also, the OAuth token rotation plan is in the shared doc — give it a skim when you get a sec.",
      timestamp: daysAgo(0.04),
    },
  ],
  DM_MAX: [
    {
      id: "sm12",
      channel_id: "DM_MAX",
      author: "Max Ravenhill",
      text: "Can you make sure the file-drop demo uses the Q2 PRD sample? That's the one I'm walking SLS through.",
      timestamp: daysAgo(0.6),
    },
  ],
  DM_KAREN: [
    {
      id: "sm13",
      channel_id: "DM_KAREN",
      author: "Karen Park",
      text: "Pricing deck is tracked — I'll ping you when the draft is ready.",
      timestamp: daysAgo(0.9),
    },
  ],
};

export async function fetchSlackChannels(): Promise<SlackChannel[]> {
  return Promise.resolve(mockSlackChannels);
}

export async function fetchSlackThread(channelId: string): Promise<SlackMessage[]> {
  return Promise.resolve(slackThreads[channelId] ?? []);
}

// ------------------------------------------------------------
// File summaries — what the receiving agent "reads" from an attachment
// ------------------------------------------------------------

// ------------------------------------------------------------
// HRIS providers + roster import
// ------------------------------------------------------------

export type HRISProviderId =
  | "rippling"
  | "gusto"
  | "bamboohr"
  | "workday"
  | "deel";

export interface HRISProvider {
  id: HRISProviderId;
  name: string;
  seat_count: number;
  last_sync?: string;
}

export const mockHRISProviders: HRISProvider[] = [
  { id: "rippling", name: "Rippling", seat_count: 61 },
  { id: "gusto", name: "Gusto", seat_count: 42 },
  { id: "bamboohr", name: "BambooHR", seat_count: 128 },
  { id: "workday", name: "Workday", seat_count: 340 },
  { id: "deel", name: "Deel", seat_count: 24 },
];

export interface HRISRosterRow {
  name: string;
  email: string;
  role: string;
  department: string;
  manager?: string;
  start_date?: string;
  employment_type: "full_time" | "contractor" | "intern";
}

const SAMPLE_ROSTER: HRISRosterRow[] = [
  {
    name: "Max Ravenhill",
    email: "max@e-agent.ai",
    role: "Chief Executive Officer",
    department: "Executive",
    employment_type: "full_time",
    start_date: "2025-11-01",
  },
  {
    name: "Muhammad Rashid",
    email: "muhammad@e-agent.ai",
    role: "Chief Technology Officer",
    department: "Engineering",
    manager: "Max Ravenhill",
    employment_type: "full_time",
    start_date: "2025-12-01",
  },
  {
    name: "Likitha Kamble",
    email: "likitha@e-agent.ai",
    role: "Chief Operating Officer",
    department: "Product",
    manager: "Max Ravenhill",
    employment_type: "full_time",
    start_date: "2025-12-01",
  },
  {
    name: "Karen Park",
    email: "karen@e-agent.ai",
    role: "Head of Finance",
    department: "Finance",
    manager: "Max Ravenhill",
    employment_type: "full_time",
    start_date: "2026-01-15",
  },
  {
    name: "Jordan Chen",
    email: "jordan@e-agent.ai",
    role: "Senior Account Executive",
    department: "Sales",
    manager: "Max Ravenhill",
    employment_type: "full_time",
    start_date: "2026-02-03",
  },
  {
    name: "Priya Shah",
    email: "priya@e-agent.ai",
    role: "Staff Engineer",
    department: "Engineering",
    manager: "Muhammad Rashid",
    employment_type: "full_time",
    start_date: "2026-02-17",
  },
  {
    name: "Marco Li",
    email: "marco@e-agent.ai",
    role: "Product Manager",
    department: "Product",
    manager: "Likitha Kamble",
    employment_type: "full_time",
    start_date: "2026-03-01",
  },
  {
    name: "Amelia Ortiz",
    email: "amelia@e-agent.ai",
    role: "Design Lead",
    department: "Product",
    manager: "Likitha Kamble",
    employment_type: "full_time",
    start_date: "2026-03-17",
  },
  {
    name: "Devon Ray",
    email: "devon@e-agent.ai",
    role: "Recruiter (Contract)",
    department: "People",
    manager: "Max Ravenhill",
    employment_type: "contractor",
    start_date: "2026-04-01",
  },
  {
    name: "Noa Kim",
    email: "noa@e-agent.ai",
    role: "Software Engineering Intern",
    department: "Engineering",
    manager: "Priya Shah",
    employment_type: "intern",
    start_date: "2026-04-07",
  },
];

export async function fetchHRISProviders(): Promise<HRISProvider[]> {
  return Promise.resolve(mockHRISProviders);
}

export async function pullHRISRoster(
  providerId: HRISProviderId,
): Promise<HRISRosterRow[]> {
  // Simulate a small network delay so the UI feels real.
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
  const seatCount =
    mockHRISProviders.find((p) => p.id === providerId)?.seat_count ??
    SAMPLE_ROSTER.length;
  // Return the full sample roster regardless of provider — seat_count is a label.
  void seatCount;
  return SAMPLE_ROSTER;
}

export function parseHRISCsv(csv: string): HRISRosterRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const get = (name: string) => (idx(name) >= 0 ? cols[idx(name)] : "");
    return {
      name: get("name"),
      email: get("email"),
      role: get("role") || get("title"),
      department: get("department") || get("team") || "Other",
      manager: get("manager") || undefined,
      start_date: get("start_date") || undefined,
      employment_type:
        (get("employment_type") as HRISRosterRow["employment_type"]) ||
        "full_time",
    };
  });
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
