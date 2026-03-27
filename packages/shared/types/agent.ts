/**
 * Shared type definitions — mirrored between frontend and backend.
 */

export interface Agent {
  id: string;
  name: string;
  role: string;
  departments: string[];
  knowledge_areas: string[];
  is_active: boolean;
}

export interface AgentMessage {
  content: string;
  agent_id: string;
  conversation_id?: string;
}

export interface AgentResponse {
  agent_id: string;
  agent_name: string;
  content: string;
  timestamp: string;
}

export interface InterAgentMessage {
  message_id: string;
  type: "QUERY" | "DOC_REQUEST" | "ACTION" | "BROADCAST";
  from_agent: string;
  to_agent: string | null;
  intent: string;
  permission_ctx: {
    role: string;
    departments: string[];
    scopes: string[];
  };
  requires_approval: boolean;
  ttl_seconds: number;
  payload: Record<string, unknown>;
  trace_id: string;
}

export interface ApprovalRequest {
  id: string;
  requesting_agent: string;
  owning_agent: string;
  action: string;
  description: string;
  resource: string;
  status: "pending" | "approved" | "denied";
}
