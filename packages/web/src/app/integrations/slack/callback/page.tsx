"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from "lucide-react";
import { submitSlackCallback } from "@/lib/api";

function CallbackInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<"working" | "ok" | "fail">("working");
  const [detail, setDetail] = useState<string>("");
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    const code = search.get("code");
    const state = search.get("state");
    const error = search.get("error");
    if (error) {
      setStatus("fail");
      setDetail(error);
      return;
    }
    if (!code || !state) {
      setStatus("fail");
      setDetail("Slack didn't return a code/state pair. Try connecting again.");
      return;
    }
    submitSlackCallback(code, state)
      .then((res) => {
        setStatus("ok");
        setTeamName(res?.team_name ?? null);
        setTimeout(() => router.push("/settings"), 1400);
      })
      .catch((e) => {
        setStatus("fail");
        setDetail(e instanceof Error ? e.message : "Unknown error");
      });
  }, [search, router]);

  return (
    <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center p-6">
      <div className="bg-ink border border-white/[0.08] rounded-2xl p-8 max-w-md w-full text-center">
        {status === "working" && (
          <>
            <Loader2 className="w-8 h-8 text-claret animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-bone">
              Connecting Slack…
            </h1>
            <p className="text-xs text-smoke mt-1">
              Exchanging your authorization code for a workspace token.
            </p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="w-8 h-8 text-[#4ADE80] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-bone">
              Slack connected
            </h1>
            <p className="text-xs text-smoke mt-1">
              {teamName ? (
                <>
                  Linked to <span className="text-parchment">{teamName}</span>.
                  Redirecting to Settings…
                </>
              ) : (
                <>Workspace linked. Redirecting to Settings…</>
              )}
            </p>
          </>
        )}
        {status === "fail" && (
          <>
            <XCircle className="w-8 h-8 text-[#F87171] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-bone">
              Couldn&apos;t complete the connection
            </h1>
            <p className="text-xs text-smoke mt-1 break-words">{detail}</p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 mt-4 text-xs text-claret hover:text-[#D6596C]"
            >
              <ArrowLeft className="w-3 h-3" /> Back to Settings
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function SlackCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-claret animate-spin" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
