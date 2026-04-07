"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { submitApproval } from "@/lib/api";

const OPS_AGENT_ID = "00000000-0000-0000-0000-000000000004";

type ConnectionState = "connecting" | "connected" | "disconnected";

interface ApprovalData {
  approval_id: string;
  requester_name: string;
  requester_role: string;
  document_name: string;
  document_description: string;
}

type PageState = "idle" | "incoming" | "context_requested" | "exiting" | "resolved";

/* ============================================================
   Ambient Background — cyan variant for approval page
   ============================================================ */
function AmbientBackground() {
  return (
    <div className="ambient-bg">
      <div className="ambient-orb ambient-orb--indigo" />
      <div className="ambient-orb ambient-orb--cyan" />
    </div>
  );
}

export default function ApprovalPage() {
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [pageState, setPageState] = useState<PageState>("idle");
  const [approval, setApproval] = useState<ApprovalData | null>(null);
  const [resolvedStatus, setResolvedStatus] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ||
      "localhost:8000";
    const url = `${protocol}//${host}/api/approvals/ws/${OPS_AGENT_ID}`;

    setConnState("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnState("connected");
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, 30000);
      ws.addEventListener("close", () => clearInterval(pingInterval));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "approval_request") {
          setApproval({
            approval_id: data.approval_id,
            requester_name: data.requester_name,
            requester_role: data.requester_role,
            document_name: data.document_name,
            document_description: data.document_description,
          });
          setPageState("incoming");
        }
        if (data.type === "approval_resolved") {
          setResolvedStatus(
            data.status === "approved" ? "Document shared." : "Request denied."
          );
          setPageState("resolved");
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnState("disconnected");
      reconnectRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  const handleDecision = async (approved: boolean) => {
    if (!approval) return;
    // Animate card exit
    setPageState("exiting");
    await new Promise((r) => setTimeout(r, 350));
    try {
      await submitApproval(approval.approval_id, approved);
      setResolvedStatus(
        approved
          ? `Document shared with ${approval.requester_name}.`
          : "Request denied."
      );
      setPageState("resolved");
    } catch {
      setResolvedStatus("Error processing decision. Please try again.");
      setPageState("resolved");
    }
  };

  const handleAskContext = () => {
    if (!approval || !wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: "context_request",
        approval_id: approval.approval_id,
        from_agent: "Alex Kumar",
        message: "Can you provide more context on why this document is needed?",
      })
    );
    setPageState("context_requested");
  };

  const handleReset = () => {
    setPageState("idle");
    setApproval(null);
    setResolvedStatus("");
  };

  return (
    <div className="flex flex-col h-screen relative" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      <AmbientBackground />

      {/* Connection indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <span
          className={`w-2 h-2 rounded-full ${
            connState === "connected"
              ? "animate-ambient-breathe"
              : connState === "connecting"
                ? "animate-ambient-breathe"
                : ""
          }`}
          style={{
            backgroundColor:
              connState === "connected"
                ? "var(--success)"
                : connState === "connecting"
                  ? "var(--warning)"
                  : "var(--danger)",
          }}
        />
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {connState === "connected"
            ? "Connected"
            : connState === "connecting"
              ? "Connecting..."
              : "Disconnected"}
        </span>
      </div>

      {/* Main content — vertically and horizontally centered */}
      <div className="flex-1 flex items-center justify-center px-4 relative z-10">

        {/* IDLE state */}
        {pageState === "idle" && (
          <div className="text-center animate-fade-up">
            <div className="flex items-center justify-center gap-2.5 mb-3">
              <span
                className="w-2 h-2 rounded-full animate-ambient-breathe"
                style={{ backgroundColor: "var(--accent-cyan)" }}
              />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Waiting for requests...
              </span>
            </div>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.06em]"
               style={{ color: "var(--text-tertiary)" }}>
              Alex Kumar &middot; Operations Manager
            </p>
            {/* Subtle cyan ambient glow behind the waiting indicator */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full animate-ambient-breathe pointer-events-none"
              style={{
                background: "radial-gradient(circle, var(--glow-cyan) 0%, transparent 70%)",
                opacity: 0.5,
              }}
            />
          </div>
        )}

        {/* INCOMING approval — cinematic entrance */}
        {pageState === "incoming" && approval && (
          <div className="relative">
            {/* Glow flash on arrival */}
            <div
              className="absolute inset-0 rounded-2xl animate-glow-pulse pointer-events-none"
              style={{ background: "var(--glow-pink)", filter: "blur(20px)" }}
            />

            <div
              className="glass-card gradient-border gradient-border-cool rounded-2xl p-8 max-w-md w-full shadow-2xl animate-approval-enter relative"
            >
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.06em] mb-1"
                 style={{ color: "var(--text-tertiary)" }}>
                Document Request
              </p>
              <h2 className="text-lg font-semibold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
                {approval.requester_name}{" "}
                <span className="font-normal text-sm" style={{ color: "var(--text-secondary)" }}>
                  &middot; {approval.requester_role}
                </span>
              </h2>

              <div className="rounded-xl px-4 py-3 mb-6" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {approval.document_name}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  {approval.document_description}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDecision(true)}
                  className="flex-1 py-2.5 rounded-xl font-medium text-sm text-white transition-all duration-200 active:scale-[0.96]"
                  style={{
                    background: "var(--gradient-hot)",
                    boxShadow: "0 0 16px var(--glow-pink)",
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleDecision(false)}
                  className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-[0.96]"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--danger)",
                    color: "var(--danger)",
                  }}
                >
                  Deny
                </button>
                <button
                  onClick={handleAskContext}
                  className="py-2.5 px-4 rounded-xl text-sm transition-all duration-200 active:scale-[0.96]"
                  style={{
                    background: "var(--bg-interactive)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Ask for Context
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONTEXT REQUESTED state */}
        {pageState === "context_requested" && approval && (
          <div className="glass-card gradient-border gradient-border-cool rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.06em] mb-1"
               style={{ color: "var(--text-tertiary)" }}>
              Document Request
            </p>
            <h2 className="text-lg font-semibold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              {approval.requester_name}{" "}
              <span className="font-normal text-sm" style={{ color: "var(--text-secondary)" }}>
                &middot; {approval.requester_role}
              </span>
            </h2>

            <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "var(--bg-elevated)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {approval.document_name}
              </p>
            </div>

            <div className="flex items-center gap-2 mb-6">
              <span className="w-1.5 h-1.5 rounded-full animate-ambient-breathe"
                    style={{ backgroundColor: "var(--warning)" }} />
              <span className="text-sm" style={{ color: "var(--warning)", opacity: 0.8 }}>
                Asked {approval.requester_name} for more context...
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleDecision(true)}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm text-white transition-all duration-200 active:scale-[0.96]"
                style={{
                  background: "var(--gradient-hot)",
                  boxShadow: "0 0 16px var(--glow-pink)",
                }}
              >
                Approve
              </button>
              <button
                onClick={() => handleDecision(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-[0.96]"
                style={{
                  background: "transparent",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                }}
              >
                Deny
              </button>
            </div>
          </div>
        )}

        {/* EXITING state — card exit animation */}
        {pageState === "exiting" && (
          <div className="glass-card rounded-2xl p-8 max-w-md w-full animate-approval-exit" />
        )}

        {/* RESOLVED state */}
        {pageState === "resolved" && (
          <div className="text-center animate-fade-up">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                 style={{
                   background: resolvedStatus.includes("shared")
                     ? "rgba(52, 211, 153, 0.1)"
                     : "rgba(248, 113, 113, 0.1)",
                   border: `1px solid ${resolvedStatus.includes("shared") ? "var(--success)" : "var(--danger)"}`,
                 }}>
              {resolvedStatus.includes("shared") ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <p className="text-lg font-semibold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
              {resolvedStatus}
            </p>
            <button
              onClick={handleReset}
              className="text-xs transition-colors hover:text-[var(--accent-pink)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              Back to waiting
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
