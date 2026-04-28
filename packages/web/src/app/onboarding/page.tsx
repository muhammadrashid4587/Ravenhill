"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  MessageSquare,
  Mail,
  Calendar as CalIcon,
  ArrowRight,
  Check,
  Users,
  Shield,
  Loader2,
  HardDriveUpload,
} from "lucide-react";
import { fetchOnboardingState, setOnboardingState } from "@/lib/mocks";
import { fetchSlackAuthUrl, fetchSlackStatus } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type { OnboardingState, OnboardingStep } from "@/lib/types";

type Source = "slack" | "gmail" | "google_calendar" | "drive";

const STEPS: Array<{
  id: OnboardingStep;
  label: string;
  blurb: string;
}> = [
  { id: "welcome", label: "Welcome", blurb: "What we'll do, in 4 steps" },
  {
    id: "connect_comms",
    label: "Connect",
    blurb: "One or more comms sources so we can infer your graph",
  },
  {
    id: "inference_preview",
    label: "Inference",
    blurb: "What we figured out from your comms",
  },
  { id: "calibrate", label: "Calibrate", blurb: "Confirm or correct" },
  {
    id: "permissions_default",
    label: "Permissions",
    blurb: "Default posture before the agent acts",
  },
  { id: "done", label: "Ready", blurb: "You're set up" },
];

const SOURCES: Array<{
  id: Source;
  label: string;
  Icon: typeof MessageSquare;
  hint: string;
}> = [
  {
    id: "slack",
    label: "Slack",
    Icon: MessageSquare,
    hint: "Best signal for inferring ownership and collaborators.",
  },
  {
    id: "gmail",
    label: "Gmail",
    Icon: Mail,
    hint: "Catches external partners and cross-org threads.",
  },
  {
    id: "google_calendar",
    label: "Calendar",
    Icon: CalIcon,
    hint: "Recurring meetings = recurring topics.",
  },
  {
    id: "drive",
    label: "Drive",
    Icon: HardDriveUpload,
    hint: "Who edits what. Adds strong document-level signal.",
  },
];

const INFERRED = {
  team: "Product",
  role: "Product designer / frontend engineer",
  collaborators: [
    { id: "u3", name: "Priya Shah", strength: 0.82 },
    { id: "u1", name: "Karen Park", strength: 0.60 },
    { id: "u4", name: "Marco Li", strength: 0.48 },
  ],
  topics: ["design system", "permissions", "onboarding"],
};

export default function OnboardingPage() {
  const router = useRouter();
  const { agent: myAgent } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [connecting, setConnecting] = useState<Source | null>(null);
  const [confirmedTeam, setConfirmedTeam] = useState(INFERRED.team);
  const [confirmedRole, setConfirmedRole] = useState(INFERRED.role);
  const [slackError, setSlackError] = useState<string | null>(null);

  useEffect(() => {
    fetchOnboardingState().then((s) => {
      setState(s);
      setStep(s.current_step);
    });
  }, []);

  // Reflect a real Slack connection in the onboarding state on mount —
  // user might have completed OAuth in another tab. Also fires once on
  // myAgent becoming available.
  useEffect(() => {
    if (!myAgent?.id) return;
    fetchSlackStatus(myAgent.id)
      .then((status) => {
        if (status.connected) {
          setState((prev) => {
            if (!prev) return prev;
            if (prev.connected_sources.includes("slack")) return prev;
            const next = {
              ...prev,
              connected_sources: [...prev.connected_sources, "slack" as Source],
              inferred_org_ready: true,
            };
            void setOnboardingState({
              connected_sources: next.connected_sources,
              inferred_org_ready: true,
            });
            return next;
          });
        }
      })
      .catch(() => {
        /* status check is best-effort */
      });
  }, [myAgent?.id]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const persist = async (patch: Partial<OnboardingState>) => {
    const next = await setOnboardingState(patch);
    setState(next);
    return next;
  };

  const advance = async (to: OnboardingStep) => {
    const next = await persist({ current_step: to });
    setStep(next.current_step);
  };

  const toggleSource = async (id: Source) => {
    if (!state) return;

    // Slack uses a real OAuth handshake — redirect the user to Slack and
    // let the callback page persist the connection. Disconnecting Slack
    // from the onboarding screen is intentionally not supported here;
    // use Settings.
    if (id === "slack" && !state.connected_sources.includes("slack")) {
      if (!myAgent?.id) {
        setSlackError("Sign in first so we can bind the Slack token to you.");
        return;
      }
      setConnecting(id);
      setSlackError(null);
      try {
        const { auth_url } = await fetchSlackAuthUrl(myAgent.id);
        window.location.href = auth_url;
        return; // navigation away — don't clear connecting flag
      } catch (e) {
        setSlackError(
          e instanceof Error ? e.message : "Couldn't start Slack OAuth.",
        );
        setConnecting(null);
        return;
      }
    }

    setConnecting(id);
    await new Promise((r) => setTimeout(r, 500));
    const connected = state.connected_sources.includes(id)
      ? state.connected_sources.filter((x) => x !== id)
      : [...state.connected_sources, id];
    await persist({
      connected_sources: connected,
      inferred_org_ready: connected.length > 0,
    });
    setConnecting(null);
  };

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-[11px] text-dusk uppercase tracking-wider mb-2">
            Setup · Step {stepIndex + 1} of {STEPS.length}
          </div>
          <div className="flex items-center gap-1 mb-3">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`flex-1 h-1 rounded-full transition ${
                  i <= stepIndex ? "bg-oxblood" : "bg-white/[0.06]"
                }`}
              />
            ))}
          </div>
          <h1 className="text-lg font-semibold text-bone">
            {STEPS[stepIndex]?.label ?? "Welcome"}
          </h1>
          <p className="text-xs text-smoke mt-0.5">
            {STEPS[stepIndex]?.blurb}
          </p>
        </div>
      </header>

      <div className="p-6 max-w-3xl mx-auto">
        {!state ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-dusk" />
          </div>
        ) : step === "welcome" ? (
          <Welcome onNext={() => advance("connect_comms")} />
        ) : step === "connect_comms" ? (
          <Connect
            state={state}
            connecting={connecting}
            slackError={slackError}
            onToggle={toggleSource}
            onNext={() => advance("inference_preview")}
          />
        ) : step === "inference_preview" ? (
          <InferencePreview onNext={() => advance("calibrate")} />
        ) : step === "calibrate" ? (
          <Calibrate
            team={confirmedTeam}
            role={confirmedRole}
            onTeam={setConfirmedTeam}
            onRole={setConfirmedRole}
            onNext={async () => {
              await persist({
                calibration: {
                  confirmed_team: confirmedTeam,
                  confirmed_role: confirmedRole,
                  top_collaborators: INFERRED.collaborators.map((c) => c.id),
                },
              });
              advance("permissions_default");
            }}
          />
        ) : step === "permissions_default" ? (
          <PermissionsDefault onNext={() => advance("done")} />
        ) : (
          <Done onFinish={() => router.push("/dashboard")} />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="rounded-xl border border-white/[0.06] bg-ink p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-oxblood/20 border border-oxblood/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-claret" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-bone">
              We&apos;ll infer your org, not survey you.
            </h2>
            <p className="text-[12px] text-smoke mt-1 leading-relaxed">
              Most onboarding flows ask you to type your team, your role, your
              collaborators. We skip that — connect one comms source and we
              read it from your message history. You&apos;ll confirm what we
              got right, correct what we got wrong, and move on.
            </p>
          </div>
        </div>
      </div>
      <ul className="space-y-2 text-[12px] text-smoke">
        <li className="flex items-start gap-2">
          <Check className="w-3 h-3 text-[#88D3A4] mt-0.5" />
          No surveys, no long forms.
        </li>
        <li className="flex items-start gap-2">
          <Check className="w-3 h-3 text-[#88D3A4] mt-0.5" />
          You can connect Slack first, or Gmail, or Calendar — one is enough.
        </li>
        <li className="flex items-start gap-2">
          <Check className="w-3 h-3 text-[#88D3A4] mt-0.5" />
          Nothing leaves your agent until you set a permission for it.
        </li>
      </ul>
      <button onClick={onNext} className="btn btn-primary text-sm px-5 py-2.5">
        Let&apos;s go <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
      </button>
    </div>
  );
}

function Connect({
  state,
  connecting,
  slackError,
  onToggle,
  onNext,
}: {
  state: OnboardingState;
  connecting: Source | null;
  slackError: string | null;
  onToggle: (s: Source) => void;
  onNext: () => void;
}) {
  const canAdvance = state.connected_sources.length > 0;
  return (
    <div className="space-y-4 animate-fade-up">
      <p className="text-[12px] text-smoke">
        Pick at least one. More sources = sharper inference, but one is enough
        to get useful results.
      </p>
      {slackError && (
        <div className="rounded-md border border-claret/40 bg-claret/10 px-3 py-2 text-[11px] text-claret">
          {slackError}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SOURCES.map((s) => {
          const connected = state.connected_sources.includes(s.id);
          const busy = connecting === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onToggle(s.id)}
              disabled={busy}
              className={`text-left rounded-xl border p-3 transition ${
                connected
                  ? "border-[rgba(63,164,106,0.40)] bg-[rgba(63,164,106,0.06)]"
                  : "border-white/[0.06] bg-ink hover:border-white/[0.12]"
              } ${busy ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                    <s.Icon className="w-4 h-4 text-parchment" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-bone">
                      {s.label}
                    </div>
                    <div className="text-[10px] text-dusk">{s.hint}</div>
                  </div>
                </div>
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-dusk" />
                ) : connected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#88D3A4]">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                ) : (
                  <span className="text-[11px] text-dusk">Connect</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-end">
        <button
          onClick={onNext}
          disabled={!canAdvance}
          className="btn btn-primary text-sm px-5 py-2.5 disabled:opacity-40"
        >
          Continue <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
        </button>
      </div>
    </div>
  );
}

function InferencePreview({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <p className="text-[12px] text-smoke">
        From your messages, meetings, and channel membership, we inferred:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-ink p-4">
          <div className="text-[11px] text-dusk uppercase tracking-wide mb-2">
            Likely team
          </div>
          <div className="text-sm text-bone font-medium">{INFERRED.team}</div>
          <div className="text-[11px] text-smoke mt-0.5">{INFERRED.role}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-ink p-4">
          <div className="text-[11px] text-dusk uppercase tracking-wide mb-2">
            Top topics
          </div>
          <div className="flex flex-wrap gap-1.5">
            {INFERRED.topics.map((t) => (
              <span
                key={t}
                className="text-[11px] px-2 py-0.5 rounded border border-white/[0.08] bg-white/[0.04] text-parchment"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-ink p-4 md:col-span-2">
          <div className="text-[11px] text-dusk uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> Frequent collaborators
          </div>
          <div className="space-y-1.5">
            {INFERRED.collaborators.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 text-[12px]"
              >
                <span className="text-parchment flex-1">{c.name}</span>
                <div className="w-24 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-oxblood to-claret"
                    style={{ width: `${c.strength * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-dusk tabular-nums w-8 text-right">
                  {Math.round(c.strength * 100)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <button onClick={onNext} className="btn btn-primary text-sm px-5 py-2.5">
        Looks reasonable <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
      </button>
    </div>
  );
}

function Calibrate({
  team,
  role,
  onTeam,
  onRole,
  onNext,
}: {
  team: string;
  role: string;
  onTeam: (s: string) => void;
  onRole: (s: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4 animate-fade-up">
      <p className="text-[12px] text-smoke">
        Correct anything that&apos;s wrong. Otherwise, keep moving.
      </p>
      <div className="rounded-xl border border-white/[0.06] bg-ink p-4 space-y-3">
        <div>
          <div className="text-[10px] text-dusk uppercase tracking-wide mb-1">
            Team
          </div>
          <input
            value={team}
            onChange={(e) => onTeam(e.target.value)}
            className="input-dark w-full"
          />
        </div>
        <div>
          <div className="text-[10px] text-dusk uppercase tracking-wide mb-1">
            Role
          </div>
          <input
            value={role}
            onChange={(e) => onRole(e.target.value)}
            className="input-dark w-full"
          />
        </div>
      </div>
      <button onClick={onNext} className="btn btn-primary text-sm px-5 py-2.5">
        Confirm <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
      </button>
    </div>
  );
}

function PermissionsDefault({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="rounded-xl border border-[rgba(90,127,174,0.30)] bg-[rgba(90,127,174,0.06)] p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-4 h-4 text-[#9BB4D4] mt-0.5" />
          <div>
            <div className="text-sm font-medium text-bone">
              Default posture: not ready
            </div>
            <p className="text-[12px] text-smoke mt-1 leading-relaxed">
              Until you set an explicit rule, your agent won&apos;t share
              anything on its own. Everything routes back to you for approval.
              You can tune this per team, topic, person, or classification in
              Settings → Permissions later.
            </p>
          </div>
        </div>
      </div>
      <ul className="space-y-2 text-[12px] text-smoke">
        <li className="flex items-start gap-2">
          <Check className="w-3 h-3 text-[#88D3A4] mt-0.5" />
          Agent answers questions about you without sharing sensitive info.
        </li>
        <li className="flex items-start gap-2">
          <Check className="w-3 h-3 text-[#88D3A4] mt-0.5" />
          Routes file requests, ownership questions, and status pings to you.
        </li>
        <li className="flex items-start gap-2">
          <Check className="w-3 h-3 text-[#88D3A4] mt-0.5" />
          Never sends messages on your behalf without approval.
        </li>
      </ul>
      <button onClick={onNext} className="btn btn-primary text-sm px-5 py-2.5">
        Sounds good <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
      </button>
    </div>
  );
}

function Done({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="space-y-4 animate-fade-up text-center py-8">
      <div className="w-12 h-12 rounded-full bg-[rgba(63,164,106,0.12)] border border-[rgba(63,164,106,0.40)] flex items-center justify-center mx-auto">
        <Check className="w-5 h-5 text-[#88D3A4]" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-bone">
          You&apos;re set up.
        </h2>
        <p className="text-[12px] text-smoke mt-1 max-w-md mx-auto">
          Your agent will start populating the expertise map and shadow profile
          as it sees more of your comms. Come back in a few hours to check.
        </p>
      </div>
      <button
        onClick={onFinish}
        className="btn btn-primary text-sm px-5 py-2.5"
      >
        Go to dashboard <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
      </button>
    </div>
  );
}
