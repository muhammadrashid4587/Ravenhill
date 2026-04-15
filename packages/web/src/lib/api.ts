/**
 * API client for the Ravenhill backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAgents() {
  const res = await fetch(`${API_BASE}/api/agents`);
  return res.json();
}

export async function fetchAgent(agentId: string) {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`);
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
  const res = await fetch(`${API_BASE}/api/agents/`, {
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
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update agent failed: ${res.status}`);
  return res.json();
}

export async function deleteAgent(agentId: string) {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete agent failed: ${res.status}`);
  return res.json();
}

export async function chatWithAgent(agentId: string, message: string) {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message, agent_id: agentId }),
  });
  return res.json();
}

export async function sendInterAgentMessage(message: {
  type: string;
  from_agent: string;
  to_agent?: string;
  intent: string;
}) {
  const res = await fetch(`${API_BASE}/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  return res.json();
}

export async function submitApproval(approvalId: string, approved: boolean) {
  const res = await fetch(`${API_BASE}/api/approvals/${approvalId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: approved ? "approved" : "denied" }),
  });
  return res.json();
}

export async function orchestrate(agentId: string, message: string) {
  const res = await fetch(`${API_BASE}/api/orchestrate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, agent_id: agentId }),
  });
  return res.json();
}

export async function completeDocRequest(approvalId: string) {
  const res = await fetch(
    `${API_BASE}/api/orchestrate/approval/${approvalId}/complete`,
  );
  return res.json();
}

export async function resetDemo() {
  const res = await fetch(`${API_BASE}/api/orchestrate/reset`, {
    method: "POST",
  });
  return res.json();
}

export async function fetchActivity(type?: string, limit?: number) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (limit) params.set("limit", String(limit));
  const res = await fetch(`${API_BASE}/api/activity?${params}`);
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/activity/stats`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

/**
 * Subscribe to real-time activity events via SSE.
 * Returns a cleanup function to close the connection.
 */
export function streamActivity(
  onEvent: (entry: Record<string, unknown>) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/api/activity/stream`);
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
  const res = await fetch(`${API_BASE}/api/meetings/`, {
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
  const res = await fetch(`${API_BASE}/api/meetings/?${params}`);
  return res.json();
}

export async function fetchMeeting(meetingId: string): Promise<Meeting> {
  const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`);
  if (!res.ok) throw new Error(`Fetch meeting failed: ${res.status}`);
  return res.json();
}

export async function updateTask(
  meetingId: string,
  taskId: string,
  updates: { status?: string; priority?: string; title?: string; description?: string },
): Promise<MeetingTask> {
  const res = await fetch(`${API_BASE}/api/meetings/${meetingId}/tasks/${taskId}`, {
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
  const res = await fetch(`${API_BASE}/api/meetings/${meetingId}/tasks/${taskId}/help`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`Task help failed: ${res.status}`);
  return res.json();
}

export async function deleteMeeting(meetingId: string) {
  const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete meeting failed: ${res.status}`);
  return res.json();
}

export async function fetchGoogleMeetings(agentId: string): Promise<GoogleMeeting[]> {
  const res = await fetch(`${API_BASE}/api/meetings/google/meetings?agent_id=${agentId}`);
  if (!res.ok) throw new Error(`Fetch Google meetings failed: ${res.status}`);
  return res.json();
}

export async function importGoogleMeeting(agentId: string, eventId: string): Promise<Meeting> {
  const res = await fetch(`${API_BASE}/api/meetings/google/import`, {
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
  const res = await fetch(`${API_BASE}/api/orchestrate/stream`, {
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
  const res = await fetch(`${API_BASE}/api/orchestrate/second-hop/stream`, {
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
