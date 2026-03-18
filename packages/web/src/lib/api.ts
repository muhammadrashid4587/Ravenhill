/**
 * API client for the e-agent backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAgents() {
  const res = await fetch(`${API_BASE}/api/agents`);
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
