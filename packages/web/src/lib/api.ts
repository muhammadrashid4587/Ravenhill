/**
 * API client for the Ravenhill backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAgents() {
  const res = await fetch(`${API_BASE}/api/agents`);
  return res.json();
}

export interface CreateAgentPayload {
  name: string;
  role: string;
  department: string;
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
    `${API_BASE}/api/orchestrate/approval/${approvalId}/complete`
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
 * Stream orchestration via SSE. Calls the callback for each parsed event.
 *
 * Event shapes:
 *   { type: "step", step: { label, status, detail } }
 *   { type: "chunk", text: string }
 *   { type: "approval", approval_id: string }
 *   { type: "done", trace_id: string }
 */
export async function orchestrateStream(
  agentId: string,
  message: string,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/orchestrate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, agent_id: agentId }),
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
