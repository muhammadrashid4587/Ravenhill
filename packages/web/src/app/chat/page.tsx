"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Send, Users } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import ApprovalPopup from "@/components/ApprovalPopup";
import { useAgent } from "@/lib/AgentContext";
import {
  orchestrate,
  submitApproval,
  completeDocRequest,
  resetDemo,
} from "@/lib/api";

interface Message {
  id: string;
  sender: string;
  content: string;
  isAgent: boolean;
  timestamp: string;
  type: "user" | "agent" | "system" | "thinking";
}

interface PendingApproval {
  approvalId: string;
  requesterName: string;
  targetName: string;
  resource: string;
}

const QUICK_PROMPTS = [
  { label: "Who owns Q4 revenue forecast?", desc: "Knowledge routing" },
  { label: "Get me the focus group results", desc: "Document request" },
  { label: "What's our pipeline looking like?", desc: "Direct question" },
];

const DEPT_COLORS: Record<string, string> = {
  Sales: "bg-blue-600",
  Finance: "bg-purple-600",
  Marketing: "bg-emerald-600",
  Engineering: "bg-orange-600",
  Product: "bg-pink-600",
  HR: "bg-cyan-600",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ChatPage() {
  const { myAgent } = useAgent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const now = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const pushMsg = useCallback(
    (
      sender: string,
      content: string,
      type: Message["type"] = "agent"
    ) => {
      const msg: Message = {
        id: crypto.randomUUID(),
        sender,
        content,
        isAgent: type !== "user",
        timestamp: now(),
        type,
      };
      setMessages((prev) => [...prev, msg]);
      scrollToBottom();
      return msg.id;
    },
    [scrollToBottom]
  );

  const removeMsg = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ---- Main orchestration flow ----
  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message || loading || !myAgent) return;
    setInput("");
    setLoading(true);

    // User message
    pushMsg("You", message, "user");
    await wait(300);

    // Thinking indicator
    const thinkingId = pushMsg(myAgent.name, "Thinking...", "thinking");

    try {
      const res = await orchestrate(myAgent.id, message);

      removeMsg(thinkingId);

      if (res.target_agent && res.target_agent.departments?.[0] !== res.source_agent.departments?.[0]) {
        // ---- ROUTED FLOW ----

        // System message: routing info
        pushMsg(
          "System",
          `Routed to ${res.target_agent.name} in ${res.target_agent.departments?.[0]}`,
          "system"
        );
        await wait(300);

        if (res.approval_id && !res.answer) {
          // ---- DOC_REQUEST: needs approval ----
          pushMsg(
            myAgent.name,
            `This is a document request. ${res.target_agent.name} needs to approve before sharing.`,
            "agent"
          );

          setApproval({
            approvalId: res.approval_id,
            requesterName: res.source_agent.name,
            targetName: res.target_agent.name,
            resource: message,
          });
        } else if (res.answer) {
          // ---- QUERY: target agent answers ----
          pushMsg(
            "System",
            `${res.target_agent.name} is responding...`,
            "system"
          );
          await wait(200);

          pushMsg(res.target_agent.name, res.answer, "agent");
        }
      } else {
        // ---- DIRECT ANSWER ----
        if (res.answer) {
          pushMsg(myAgent.name, res.answer, "agent");
        }
      }
    } catch {
      removeMsg(thinkingId);
      pushMsg(
        "System",
        "Could not reach the backend. Is the API server running on localhost:8000?",
        "system"
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
      pushMsg(
        "System",
        `${approval.targetName} approved the request`,
        "system"
      );
      await wait(300);

      const thinkId = pushMsg(approval.targetName, "Thinking...", "thinking");
      const res = await completeDocRequest(approval.approvalId);
      removeMsg(thinkId);

      if (res.answer) {
        pushMsg(approval.targetName, res.answer, "agent");
      }
    } else {
      pushMsg(
        "System",
        `${approval.targetName} denied the request`,
        "system"
      );
    }

    setLoading(false);
  };

  // ---- Reset ----
  const handleReset = async () => {
    await resetDemo();
    setMessages([]);
    setApproval(null);
  };

  // ---- No agent selected ----
  if (!myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-white">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-6">
          <Users className="w-8 h-8 text-gray-500" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No agent selected</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-sm text-center">
          Select an agent to start chatting. Your agent handles everything — finds
          the right people, routes questions, and gets approvals.
        </p>
        <Link
          href="/agents?pick=true"
          className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl text-sm font-medium transition"
        >
          Choose an Agent
        </Link>
      </div>
    );
  }

  const agentColor = DEPT_COLORS[myAgent.departments?.[0]] ?? "bg-gray-600";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full ${agentColor} flex items-center justify-center text-xs font-bold`}
          >
            {getInitials(myAgent.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">Your Agent: {myAgent.name}</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                {myAgent.departments?.[0]}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">{myAgent.role}</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-gray-500 hover:text-white border border-gray-800 hover:border-gray-600 px-3 py-1.5 rounded-lg transition"
        >
          Clear Chat
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <div
              className={`w-14 h-14 rounded-2xl ${agentColor} flex items-center justify-center text-lg font-bold text-white mb-4`}
            >
              {getInitials(myAgent.name)}
            </div>
            <p className="text-sm mb-1">
              Talk to {myAgent.name}
            </p>
            <p className="text-xs text-gray-600 max-w-xs text-center">
              Ask anything. Your agent will find the right person, route your
              question, and get you an answer.
            </p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.type === "system") {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900/80 border border-gray-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[11px] text-gray-400">{msg.content}</span>
                </div>
              </div>
            );
          }

          if (msg.type === "thinking") {
            return (
              <div key={msg.id} className="flex justify-start mb-3">
                <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-800/80">
                  <div className="text-[11px] font-medium mb-1 text-gray-400">
                    {msg.sender}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            );
          }

          return (
            <ChatMessage
              key={msg.id}
              sender={msg.sender}
              content={msg.content}
              isAgent={msg.isAgent}
              timestamp={msg.timestamp}
            />
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Quick prompts + Input */}
      <div className="border-t border-gray-800 p-4 shrink-0">
        {messages.length === 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                onClick={() => handleSend(prompt.label)}
                disabled={loading}
                className="flex flex-col items-start text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 px-3 py-2 rounded-xl whitespace-nowrap transition disabled:opacity-40 min-w-0"
              >
                <span className="text-xs text-white">{prompt.label}</span>
                <span className="text-[10px] text-gray-500">{prompt.desc}</span>
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${myAgent.name} something...`}
            disabled={loading}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition disabled:opacity-50 placeholder:text-gray-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 px-5 py-3 rounded-xl font-medium text-sm transition flex items-center gap-2"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </form>
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
    </div>
  );
}
