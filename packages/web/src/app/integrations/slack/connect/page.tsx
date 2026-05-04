"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";

/**
 * Intermediate Slack connect page — shown in the popup BEFORE the
 * OAuth redirect. Solves the "wrong workspace auto-selected" problem:
 * the user first signs into the right Slack workspace, then clicks
 * "Continue" to start OAuth from that session.
 *
 * The real OAuth URL is passed in via ?auth_url=<encoded>.
 */
function ConnectInner() {
  const params = useSearchParams();
  const authUrl = params.get("auth_url") || "";

  const handleContinue = () => {
    if (authUrl) {
      window.location.href = authUrl;
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center p-6">
      <div className="bg-ink border border-white/[0.08] rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-lg font-semibold text-bone mb-2">
          Connect Slack
        </h1>
        <p className="text-[13px] text-smoke mb-6 leading-relaxed">
          Make sure you're signed into the <strong>right Slack workspace</strong>{" "}
          before continuing. Slack will connect whichever workspace your
          browser is currently signed into.
        </p>

        <div className="space-y-3 mb-6">
          <div className="bg-graphite border border-white/[0.06] rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-wider text-dusk font-semibold mb-2">
              Step 1 — Sign into the right workspace
            </div>
            <p className="text-[12px] text-smoke mb-3">
              If Slack keeps showing the wrong workspace, sign out and
              sign back in to the one you want.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://slack.com/signin#/signin"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-fog hover:bg-graphite border border-white/[0.06] rounded-md px-3 py-1.5 text-[12px] text-parchment transition"
              >
                <ExternalLink className="w-3 h-3" />
                Open Slack sign-in
              </a>
              <a
                href="https://slack.com/signout"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-smoke hover:text-parchment transition"
              >
                Sign out of Slack first
              </a>
            </div>
          </div>

          <div className="bg-graphite border border-white/[0.06] rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-wider text-dusk font-semibold mb-2">
              Step 2 — Connect Ravenhill
            </div>
            <p className="text-[12px] text-smoke mb-3">
              Once you're in the right workspace, click below to
              authorize Ravenhill.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!authUrl}
              className="inline-flex items-center gap-1.5 bg-oxblood hover:bg-claret text-bone rounded-md px-4 py-2 text-[13px] font-medium transition disabled:opacity-50"
            >
              Continue to Slack
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-[10px] text-dusk italic">
          Ravenhill reads your channels and messages (read-only). It
          does not post on your behalf without a separate permission.
        </p>
      </div>
    </div>
  );
}

export default function SlackConnectPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-obsidian" />}>
      <ConnectInner />
    </Suspense>
  );
}
