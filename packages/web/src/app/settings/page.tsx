"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Save,
  Building2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import {
  disconnectGoogle,
  fetchGoogleAuthUrl,
  fetchGoogleStatus,
  fetchHealth,
  type GoogleStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function SettingsPage() {
  const { agent: myAgent } = useAuth();
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [connStatus, setConnStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string>("");

  useEffect(() => {
    fetchGoogleStatus(myAgent?.id)
      .then(setGoogle)
      .catch(() => setGoogle(null));
  }, [myAgent]);

  const handleConnectGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError("");
    try {
      const { auth_url } = await fetchGoogleAuthUrl();
      window.location.href = auth_url;
    } catch (e) {
      setGoogleError(
        e instanceof Error
          ? e.message
          : "Google OAuth isn't configured on the server. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env and restart.",
      );
      setGoogleBusy(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setGoogleBusy(true);
    try {
      await disconnectGoogle(myAgent?.id);
      const status = await fetchGoogleStatus(myAgent?.id);
      setGoogle(status);
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testConnection = async () => {
    setConnStatus("testing");
    try {
      await fetchHealth();
      setConnStatus("ok");
    } catch {
      setConnStatus("fail");
    }
    setTimeout(() => setConnStatus("idle"), 3000);
  };

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-gray-500">
          Configure your Ravenhill instance
        </p>
      </div>

      <div className="space-y-8">
        {/* Permissions — who your agent can share with, on its own */}
        <Link
          href="/settings/permissions"
          className="block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-6 transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-claret" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-100">
                  Permissions
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Per-team / topic / person / classification / external rules.
                  Default is not-ready.
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition" />
          </div>
        </Link>

        {/* HRIS import — pull the whole roster in one click */}
        <Link
          href="/settings/hris"
          className="block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-6 transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-100">
                  Import from HRIS
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Rippling, Gusto, BambooHR, Workday, or CSV — creates an agent
                  per employee
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition" />
          </div>
        </Link>

        {/* Connection */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Connection</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                API Server URL
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition"
              />
              <p className="text-[10px] text-gray-600 mt-1">
                The FastAPI backend URL. Default: http://localhost:8000
              </p>
              <button
                onClick={testConnection}
                disabled={connStatus === "testing"}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 transition disabled:opacity-50"
              >
                {connStatus === "testing"
                  ? "Testing..."
                  : connStatus === "ok"
                    ? "Connected!"
                    : connStatus === "fail"
                      ? "Connection failed"
                      : "Test Connection"}
              </button>
            </div>
          </div>
        </section>

        {/* Agent Behavior */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Agent Behavior</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-200">
                  Require approval for document sharing
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Human-in-the-loop for all cross-department file shares
                </div>
              </div>
              <button
                onClick={() => setApprovalRequired(!approvalRequired)}
                className={`w-10 h-6 rounded-full transition relative ${
                  approvalRequired ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition ${
                    approvalRequired ? "left-5" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-200">Notifications</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Show notifications when agents complete actions
                </div>
              </div>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`w-10 h-6 rounded-full transition relative ${
                  notificationsEnabled ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition ${
                    notificationsEnabled ? "left-5" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Integrations</h2>

          {/* Google Workspace — one OAuth unlocks Calendar + Drive + Gmail */}
          <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4 mb-3">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path fill="#4285F4" d="M22.5 12.3c0-.75-.07-1.47-.2-2.16H12v4.1h5.9a5.05 5.05 0 0 1-2.19 3.32v2.76h3.54c2.07-1.9 3.25-4.72 3.25-8.02z" />
                    <path fill="#34A853" d="M12 23c2.95 0 5.43-.98 7.24-2.66l-3.54-2.76c-.98.66-2.24 1.05-3.7 1.05a6.47 6.47 0 0 1-6.08-4.48H2.27v2.84A10.97 10.97 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.92 14.15a6.58 6.58 0 0 1 0-4.3V7.01H2.27a10.97 10.97 0 0 0 0 9.98l3.65-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.6 0 3.05.55 4.19 1.63l3.13-3.13A10.95 10.95 0 0 0 12 1 10.97 10.97 0 0 0 2.27 7.01l3.65 2.84A6.47 6.47 0 0 1 12 5.38z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-gray-100">
                      Google Workspace
                    </div>
                    {google?.connected && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/30">
                        <CheckCircle2 className="w-2.5 h-2.5" /> connected
                      </span>
                    )}
                    {google && !google.configured && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-300 border-amber-500/30">
                        <AlertCircle className="w-2.5 h-2.5" /> not configured
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    One consent unlocks Calendar, Drive, and Gmail (read-only).
                  </div>
                </div>
              </div>
              {google?.connected ? (
                <button
                  onClick={handleDisconnectGoogle}
                  disabled={googleBusy}
                  className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  <LogOut className="w-3 h-3" /> Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  disabled={googleBusy}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  {googleBusy ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      Connect <ExternalLink className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Calendar", scope: "calendar.readonly" },
                { label: "Drive", scope: "drive.readonly" },
                { label: "Gmail", scope: "gmail.readonly" },
              ].map((s) => (
                <div
                  key={s.scope}
                  className="bg-gray-900 border border-gray-800 rounded-md px-2.5 py-1.5"
                >
                  <div className="text-[11px] text-gray-200">{s.label}</div>
                  <div className="text-[10px] text-gray-600 font-mono truncate">
                    {s.scope}
                  </div>
                </div>
              ))}
            </div>

            {googleError && (
              <div className="mt-3 text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2.5 py-2 break-words">
                {googleError}
              </div>
            )}
            {google && !google.configured && !googleError && (
              <p className="mt-3 text-[11px] text-gray-500">
                Server-side credentials are missing. Set{" "}
                <code className="text-gray-300">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="text-gray-300">GOOGLE_CLIENT_SECRET</code> in{" "}
                <code className="text-gray-300">packages/api/.env</code> and
                restart the API.
              </p>
            )}
          </div>

          {/* Others still coming */}
          <div className="space-y-1">
            {[
              { name: "Slack", status: "Events API adapter shipped — user OAuth pending" },
              { name: "Microsoft Teams", status: "Phase 2" },
            ].map((integration) => (
              <div
                key={integration.name}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <div className="text-sm text-gray-200">
                    {integration.name}
                  </div>
                  <div className="text-[10px] text-gray-600">
                    {integration.status}
                  </div>
                </div>
                <button
                  disabled
                  className="text-xs text-gray-500 border border-gray-800 px-3 py-1.5 rounded-lg cursor-not-allowed"
                >
                  Soon
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg text-sm font-medium transition"
        >
          <Save className="w-4 h-4" />
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
