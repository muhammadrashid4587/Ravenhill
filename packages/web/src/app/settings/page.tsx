"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Save,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ExternalLink,
  Eye,
} from "lucide-react";
import {
  disconnectGoogle,
  disconnectSlack,
  fetchGoogleAuthUrl,
  fetchGoogleStatus,
  fetchHealth,
  fetchSlackAuthUrl,
  fetchSlackStatus,
  type GoogleStatus,
  type SlackStatus,
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
  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [slackBusy, setSlackBusy] = useState(false);
  const [slackError, setSlackError] = useState<string>("");

  useEffect(() => {
    fetchGoogleStatus()
      .then(setGoogle)
      .catch(() => setGoogle(null));
    if (myAgent?.id) {
      fetchSlackStatus(myAgent.id)
        .then(setSlack)
        .catch(() => setSlack(null));
    }
  }, [myAgent]);

  const handleConnectSlack = async () => {
    if (!myAgent?.id) {
      setSlackError("Sign in first so the Slack token is bound to you.");
      return;
    }
    setSlackBusy(true);
    setSlackError("");
    try {
      const { auth_url } = await fetchSlackAuthUrl(myAgent.id);
      // Open a popup — first to Slack's workspace-sign-in page so the
      // user can pick which workspace to connect. The browser's Slack
      // session cookie auto-selects one workspace; if that's wrong,
      // the user needs to sign into the right one first.
      //
      // Flow: popup opens → Slack sign-in (user picks workspace) →
      // "Continue to Ravenhill" link on our intermediate page starts
      // the OAuth → Slack shows the Allow/Deny screen → callback
      // auto-closes the popup.
      const w = 600;
      const h = 700;
      const left = Math.max(0, (window.screen.width - w) / 2);
      const top = Math.max(0, (window.screen.height - h) / 2);
      // Encode the real OAuth URL so the intermediate page can hand
      // off to it after the user confirms their workspace.
      const encodedAuth = encodeURIComponent(auth_url);
      const intermediateUrl =
        `/integrations/slack/connect?auth_url=${encodedAuth}`;
      const popup = window.open(
        intermediateUrl,
        "ravenhill_slack_connect",
        `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
      );
      if (popup) {
        const poll = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(poll);
            setSlackBusy(false);
            if (myAgent?.id) {
              fetchSlackStatus(myAgent.id)
                .then(setSlack)
                .catch(() => {});
            }
          }
        }, 500);
      } else {
        window.location.href = auth_url;
      }
    } catch (e) {
      setSlackError(
        e instanceof Error
          ? e.message
          : "Slack OAuth isn't configured on the server. Set SLACK_CLIENT_ID + SLACK_CLIENT_SECRET in .env and restart.",
      );
      setSlackBusy(false);
    }
  };

  const handleDisconnectSlack = async () => {
    if (!myAgent?.id) return;
    setSlackBusy(true);
    try {
      await disconnectSlack(myAgent.id);
      const status = await fetchSlackStatus(myAgent.id);
      setSlack(status);
    } finally {
      setSlackBusy(false);
    }
  };

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
      await disconnectGoogle();
      const status = await fetchGoogleStatus();
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
        <p className="text-sm text-dusk">
          Configure your Ravenhill instance
        </p>
      </div>

      <div className="space-y-8">
        {/* Shadow — what your agent is allowed to do on its own */}
        <Link
          href="/settings/shadow"
          className="block bg-ink border border-[color:var(--border)] hover:border-[color:var(--border-hover)] rounded-xl p-6 transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-graphite border border-[color:var(--border-hover)] flex items-center justify-center">
                <Eye className="w-4 h-4 text-claret" />
              </div>
              <div>
                <div className="text-sm font-medium text-bone">
                  Shadow
                </div>
                <div className="text-xs text-dusk mt-0.5">
                  Set what your agent can do autonomously — read-only,
                  soft actions, and hard actions, each with Auto / Ask / Off.
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-dusk group-hover:text-parchment transition" />
          </div>
        </Link>

        {/* Permissions and HRIS cards hidden until they have real backends.
            Pages remain reachable by URL for dev. Surfacing them here would
            invite the beta company to click into half-built screens. */}

        {/* Connection */}
        <section className="bg-ink border border-[color:var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Connection</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-smoke mb-1.5">
                API Server URL
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full bg-graphite border border-[color:var(--border-hover)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-oxblood transition"
              />
              <p className="text-[10px] text-dusk mt-1">
                The FastAPI backend URL. Default: http://localhost:8000
              </p>
              <button
                onClick={testConnection}
                disabled={connStatus === "testing"}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-[color:var(--border-hover)] hover:border-[color:var(--border-strong)] transition disabled:opacity-50"
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
        <section className="bg-ink border border-[color:var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Agent Behavior</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-bone">
                  Require approval for document sharing
                </div>
                <div className="text-xs text-dusk mt-0.5">
                  Human-in-the-loop for all cross-department file shares
                </div>
              </div>
              <button
                onClick={() => setApprovalRequired(!approvalRequired)}
                className={`w-10 h-6 rounded-full transition relative ${
                  approvalRequired ? "bg-blue-600" : "bg-fog"
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
                <div className="text-sm text-bone">Notifications</div>
                <div className="text-xs text-dusk mt-0.5">
                  Show notifications when agents complete actions
                </div>
              </div>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`w-10 h-6 rounded-full transition relative ${
                  notificationsEnabled ? "bg-blue-600" : "bg-fog"
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
        <section className="bg-ink border border-[color:var(--border)] rounded-xl p-6">
          <h2 className="text-sm font-medium mb-4">Integrations</h2>

          {/* Google Workspace — one OAuth unlocks Calendar + Drive + Gmail */}
          <div className="bg-obsidian/60 border border-[color:var(--border)] rounded-lg p-4 mb-3">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-graphite border border-[color:var(--border-hover)] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path fill="#4285F4" d="M22.5 12.3c0-.75-.07-1.47-.2-2.16H12v4.1h5.9a5.05 5.05 0 0 1-2.19 3.32v2.76h3.54c2.07-1.9 3.25-4.72 3.25-8.02z" />
                    <path fill="#34A853" d="M12 23c2.95 0 5.43-.98 7.24-2.66l-3.54-2.76c-.98.66-2.24 1.05-3.7 1.05a6.47 6.47 0 0 1-6.08-4.48H2.27v2.84A10.97 10.97 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.92 14.15a6.58 6.58 0 0 1 0-4.3V7.01H2.27a10.97 10.97 0 0 0 0 9.98l3.65-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.6 0 3.05.55 4.19 1.63l3.13-3.13A10.95 10.95 0 0 0 12 1 10.97 10.97 0 0 0 2.27 7.01l3.65 2.84A6.47 6.47 0 0 1 12 5.38z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-bone">
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
                  <div className="text-xs text-dusk mt-0.5">
                    One consent unlocks Calendar, Drive, and Gmail (read-only).
                  </div>
                </div>
              </div>
              {google?.connected ? (
                <button
                  onClick={handleDisconnectGoogle}
                  disabled={googleBusy}
                  className="flex items-center gap-1.5 text-xs text-parchment hover:text-white border border-[color:var(--border-hover)] hover:border-[color:var(--border-strong)] px-3 py-1.5 rounded-lg transition disabled:opacity-50"
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
                  className="bg-ink border border-[color:var(--border)] rounded-md px-2.5 py-1.5"
                >
                  <div className="text-[11px] text-bone">{s.label}</div>
                  <div className="text-[10px] text-dusk font-mono truncate">
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
              <p className="mt-3 text-[11px] text-dusk">
                Server-side credentials are missing. Set{" "}
                <code className="text-parchment">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="text-parchment">GOOGLE_CLIENT_SECRET</code> in{" "}
                <code className="text-parchment">packages/api/.env</code> and
                restart the API.
              </p>
            )}
          </div>

          {/* Slack — real OAuth + read-only channel listing */}
          <div className="border-t border-white/[0.06] pt-4 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-bone">Slack</div>
                <div className="text-[11px] text-dusk mt-0.5">
                  {slack?.connected ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-[#4ADE80] inline -mt-0.5 mr-1" />
                      Connected{slack.team_name ? ` — ${slack.team_name}` : ""}
                    </>
                  ) : slack?.configured ? (
                    "Read access to channels and messages."
                  ) : (
                    "Server-side OAuth credentials not configured."
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {slack?.connected ? (
                  <>
                    <Link
                      href="/settings/integrations/slack"
                      className="text-xs text-parchment border border-[color:var(--border)] hover:border-[color:var(--border-hover)] px-3 py-1.5 rounded-lg"
                    >
                      View channels
                    </Link>
                    <button
                      onClick={async () => {
                        await handleDisconnectSlack();
                        handleConnectSlack();
                      }}
                      disabled={slackBusy}
                      className="text-xs text-white bg-[#4A154B] hover:bg-[#611f63] px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Switch workspace
                    </button>
                    <button
                      onClick={handleDisconnectSlack}
                      disabled={slackBusy}
                      className="text-xs text-dusk border border-[color:var(--border)] hover:border-[color:var(--border-hover)] px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectSlack}
                    disabled={slackBusy || !slack?.configured}
                    className="text-xs text-white bg-[#4A154B] hover:bg-[#611f63] px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {slackBusy ? "Opening Slack…" : "Connect Slack"}
                  </button>
                )}
              </div>
            </div>
            {slackError && (
              <div className="mt-3 flex items-start gap-2 text-[11px] text-red-300">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{slackError}</span>
              </div>
            )}
            {slack && !slack.configured && !slackError && (
              <p className="mt-3 text-[11px] text-dusk">
                Server-side credentials are missing. Set{" "}
                <code className="text-parchment">SLACK_CLIENT_ID</code> and{" "}
                <code className="text-parchment">SLACK_CLIENT_SECRET</code> in{" "}
                <code className="text-parchment">packages/api/.env</code> and
                restart the API.
              </p>
            )}
          </div>

          {/* Others still coming */}
          <div className="space-y-1">
            {[{ name: "Microsoft Teams", status: "Phase 2" }].map(
              (integration) => (
                <div
                  key={integration.name}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <div className="text-sm text-bone">
                      {integration.name}
                    </div>
                    <div className="text-[10px] text-dusk">
                      {integration.status}
                    </div>
                  </div>
                  <button
                    disabled
                    className="text-xs text-dusk border border-[color:var(--border)] px-3 py-1.5 rounded-lg cursor-not-allowed"
                  >
                    Soon
                  </button>
                </div>
              ),
            )}
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
