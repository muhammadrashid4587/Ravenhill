"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ChatMessage from "@/components/ChatMessage";
import ApprovalPopup from "@/components/ApprovalPopup";
import {
  orchestrate,
  submitApproval,
  completeDocRequest,
  resetDemo,
} from "@/lib/api";

const JORDAN_ID = "00000000-0000-0000-0000-000000000001";

interface Message {
  id: string;
  sender: string;
  content: string;
  isAgent: boolean;
  timestamp: string;
  side: "left" | "right";
  type?: "user" | "agent" | "system" | "thinking";
}

interface PendingApproval {
  approvalId: string;
  requesterName: string;
  targetName: string;
  resource: string;
}

const DEMO_PROMPTS = [
  { label: "Who owns Q4 revenue forecast?", desc: "Knowledge routing" },
  { label: "Get me the focus group results", desc: "File sharing + approval" },
  { label: "What's the Acme Corp deal status?", desc: "Direct answer" },
  { label: "What's our Q4 pipeline looking like?", desc: "Direct answer" },
];

// Small delay helper to make the flow feel real
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function DemoPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [activeStep, setActiveStep] = useState("");
  const leftEndRef = useRef<HTMLDivElement>(null);
  const rightEndRef = useRef<HTMLDivElement>(null);

  const scrollLeft = useCallback(() => {
    setTimeout(() => leftEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);
  const scrollRight = useCallback(() => {
    setTimeout(() => rightEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const now = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const pushMsg = useCallback(
    (
      sender: string,
      content: string,
      side: "left" | "right",
      type: Message["type"] = "agent"
    ) => {
      const msg: Message = {
        id: crypto.randomUUID(),
        sender,
        content,
        isAgent: type !== "user",
        timestamp: now(),
        side,
        type,
      };
      setMessages((prev) => [...prev, msg]);
      if (side === "left") scrollLeft();
      else scrollRight();
      return msg.id;
    },
    [scrollLeft, scrollRight]
  );

  const removeMsg = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ---- Main orchestration flow with visible agent-to-agent comms ----
  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message || loading) return;
    setInput("");
    setLoading(true);

    // 1. User sends to Jordan
    pushMsg("You", message, "left", "user");
    await wait(400);

    // 2. Jordan is thinking...
    setActiveStep("Jordan's agent is analyzing your request...");
    const thinkingId = pushMsg("Jordan Chen", "Thinking...", "left", "thinking");
    await wait(300);

    try {
      const res = await orchestrate(JORDAN_ID, message);

      // 3. Remove thinking, show Jordan's classification
      removeMsg(thinkingId);

      if (res.target_agent && res.target_agent.department !== res.source_agent.department) {
        // ---- ROUTED FLOW: Jordan → Karen ----

        // Jordan decides to route
        setActiveStep(`Routing to ${res.target_agent.name}...`);
        pushMsg(
          "Jordan Chen",
          `This is a ${res.intent === "DOC_REQUEST" ? "document request" : "question"} about ${res.steps?.[0]?.detail?.split("—")?.[1]?.trim() || res.target_agent.department}. Let me connect you with ${res.target_agent.name} in ${res.target_agent.department}.`,
          "left",
          "agent"
        );
        await wait(600);

        // Show the inter-agent message on Karen's side
        setActiveStep(`${res.target_agent.name}'s agent is receiving the request...`);
        pushMsg(
          `Jordan → ${res.target_agent.name}`,
          `"${message}"`,
          "right",
          "system"
        );
        await wait(400);

        if (res.approval_id && !res.answer) {
          // ---- DOC_REQUEST: needs approval ----
          setActiveStep("Approval required — waiting for human decision");
          pushMsg(
            res.target_agent.name,
            `This request requires my approval before I can share any documents.`,
            "right",
            "agent"
          );

          setApproval({
            approvalId: res.approval_id,
            requesterName: res.source_agent.name,
            targetName: res.target_agent.name,
            resource: message,
          });
        } else if (res.answer) {
          // ---- QUERY: Karen answers ----
          const karenThinkId = pushMsg(res.target_agent.name, "Thinking...", "right", "thinking");
          await wait(500);
          removeMsg(karenThinkId);

          setActiveStep("Response received");
          pushMsg(res.target_agent.name, res.answer, "right", "agent");
          await wait(400);

          // Jordan relays back
          pushMsg(
            "Jordan Chen",
            `Got the answer from ${res.target_agent.name}. See their response on the right.`,
            "left",
            "agent"
          );
        }
      } else {
        // ---- DIRECT ANSWER: Jordan handles it ----
        setActiveStep("Answering directly");
        if (res.answer) {
          pushMsg("Jordan Chen", res.answer, "left", "agent");
        }
      }
    } catch {
      removeMsg(thinkingId);
      pushMsg(
        "System",
        "Could not reach the backend. Is the API server running on localhost:8000?",
        "left",
        "system"
      );
    } finally {
      setLoading(false);
      await wait(1500);
      setActiveStep("");
    }
  };

  // ---- Approval handler ----
  const handleApproval = async (approved: boolean) => {
    if (!approval) return;
    setLoading(true);
    setApproval(null);

    await submitApproval(approval.approvalId, approved);

    if (approved) {
      setActiveStep(`${approval.targetName} approved — retrieving document...`);
      pushMsg(approval.targetName, "Approved. Let me pull that together for you.", "right", "agent");
      await wait(400);

      const thinkId = pushMsg(approval.targetName, "Thinking...", "right", "thinking");
      const res = await completeDocRequest(approval.approvalId);
      removeMsg(thinkId);

      if (res.answer) {
        pushMsg(approval.targetName, res.answer, "right", "agent");
        await wait(400);
        pushMsg(
          "Jordan Chen",
          `${approval.targetName} shared the document. See their response on the right.`,
          "left",
          "agent"
        );
      }
      setActiveStep("Document delivered");
    } else {
      setActiveStep("Request denied");
      pushMsg(approval.targetName, "I've denied this request.", "right", "agent");
      await wait(300);
      pushMsg(
        "Jordan Chen",
        `${approval.targetName} denied the document request.`,
        "left",
        "agent"
      );
    }

    setLoading(false);
    await wait(1500);
    setActiveStep("");
  };

  // ---- Reset ----
  const handleReset = async () => {
    await resetDemo();
    setMessages([]);
    setApproval(null);
    setActiveStep("");
  };

  const leftMessages = messages.filter((m) => m.side === "left");
  const rightMessages = messages.filter((m) => m.side === "right");

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <a href="/" className="text-gray-500 hover:text-white transition text-sm">
            &larr;
          </a>
          <div>
            <h1 className="text-base font-semibold">e-agent</h1>
            <p className="text-[11px] text-gray-500">Multi-agent orchestration demo</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeStep && (
            <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse">
              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full" />
              {activeStep}
            </div>
          )}
          <button
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-white border border-gray-800 hover:border-gray-600 px-3 py-1.5 rounded-lg transition"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Split-screen */}
      <div className="flex flex-1 min-h-0">
        {/* Jordan's panel */}
        <div className="flex-1 flex flex-col border-r border-gray-800">
          <div className="px-4 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                JC
              </div>
              <div>
                <div className="text-sm font-medium">Jordan Chen</div>
                <div className="text-[11px] text-gray-500">Sales Rep &middot; West Region</div>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-400 border border-blue-800">
              Your agent
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {leftMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
                <div className="text-2xl">&#x1f4ac;</div>
                <p>Send a message to start</p>
              </div>
            )}
            {leftMessages.map((msg) => (
              <div key={msg.id} className={msg.type === "thinking" ? "animate-pulse" : ""}>
                <ChatMessage
                  sender={msg.sender}
                  content={msg.type === "thinking" ? "..." : msg.content}
                  isAgent={msg.isAgent}
                  timestamp={msg.type === "thinking" ? undefined : msg.timestamp}
                />
              </div>
            ))}
            <div ref={leftEndRef} />
          </div>
        </div>

        {/* Karen's panel */}
        <div className="flex-1 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                KP
              </div>
              <div>
                <div className="text-sm font-medium">Karen Park</div>
                <div className="text-[11px] text-gray-500">Finance Analyst</div>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-400 border border-purple-800">
              Peer agent
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {rightMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
                <div className="text-2xl">&#x1f6e1;</div>
                <p>Inter-agent messages will appear here</p>
              </div>
            )}
            {rightMessages.map((msg) => (
              <div key={msg.id} className={msg.type === "thinking" ? "animate-pulse" : ""}>
                <ChatMessage
                  sender={msg.sender}
                  content={msg.type === "thinking" ? "..." : msg.content}
                  isAgent={msg.isAgent}
                  timestamp={msg.type === "thinking" ? undefined : msg.timestamp}
                />
              </div>
            ))}
            <div ref={rightEndRef} />
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 p-4 shrink-0">
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {DEMO_PROMPTS.map((prompt) => (
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Jordan's agent something..."
            disabled={loading}
            className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition disabled:opacity-50 placeholder:text-gray-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 px-5 py-3 rounded-xl font-medium text-sm transition"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Send"
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
