"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  Wrench,
  AlertTriangle,
  Check,
  HelpCircle,
  Ban,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchCapabilities,
  setCapabilityPermission,
  type AgentCapability,
  type CapabilityLane,
  type CapabilityPermission,
} from "@/lib/api";

const LANES: Array<{
  id: CapabilityLane;
  title: string;
  blurb: string;
  icon: typeof Eye;
}> = [
  {
    id: "observation",
    title: "Read-only",
    blurb:
      "What your agent can look at to answer questions. None of these change anything.",
    icon: Eye,
  },
  {
    id: "soft",
    title: "Soft actions",
    blurb:
      "Reversible writes you'll see — drafts, replies in your voice, routing on your behalf.",
    icon: Wrench,
  },
  {
    id: "hard",
    title: "Public / hard to undo",
    blurb:
      "Externally visible or non-reversible. Default off — only flip on if you're sure.",
    icon: AlertTriangle,
  },
];

const PERMISSION_LABELS: Record<CapabilityPermission, string> = {
  auto: "Auto",
  ask: "Ask",
  never: "Off",
};

const PERMISSION_HELP: Record<CapabilityPermission, string> = {
  auto: "Your agent does this without asking",
  ask: "Your agent asks you first each time",
  never: "Your agent never does this",
};

const PERMISSION_ICON: Record<CapabilityPermission, typeof Check> = {
  auto: Check,
  ask: HelpCircle,
  never: Ban,
};

function PermissionToggle({
  value,
  onChange,
  disabled,
}: {
  value: CapabilityPermission;
  onChange: (next: CapabilityPermission) => void;
  disabled?: boolean;
}) {
  const options: CapabilityPermission[] = ["auto", "ask", "never"];
  return (
    <div
      className={`inline-flex items-center bg-ink border border-white/[0.08] rounded-lg p-0.5 ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
      role="radiogroup"
      aria-label="permission"
    >
      {options.map((opt) => {
        const active = value === opt;
        const Icon = PERMISSION_ICON[opt];
        const accent =
          opt === "auto"
            ? "text-[#88D3A4]"
            : opt === "ask"
              ? "text-[#C98A2B]"
              : "text-[#D88A8A]";
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            title={PERMISSION_HELP[opt]}
            onClick={() => onChange(opt)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              active
                ? `bg-white/[0.08] text-bone ${accent}`
                : "text-smoke hover:text-parchment"
            }`}
          >
            <Icon className={`w-3 h-3 ${active ? accent : ""}`} strokeWidth={2} />
            {PERMISSION_LABELS[opt]}
          </button>
        );
      })}
    </div>
  );
}

function SourceBadge({
  source,
  changedFromDefault,
}: {
  source: AgentCapability["source"];
  changedFromDefault: boolean;
}) {
  if (source === "learned") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-claret border border-claret/30 bg-claret/10 rounded px-1.5 py-0.5">
        <Sparkles className="w-2.5 h-2.5" />
        Learned from your behavior
      </span>
    );
  }
  if (source === "user" && changedFromDefault) {
    return (
      <span className="inline-flex items-center text-[10px] text-bone/70 border border-white/[0.08] rounded px-1.5 py-0.5">
        Custom
      </span>
    );
  }
  return null;
}

export default function ShadowPage() {
  const { agent: myAgent, loading: authLoading } = useAuth();
  const [caps, setCaps] = useState<AgentCapability[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!myAgent) return;
    fetchCapabilities()
      .then((list) => {
        setCaps(list);
        setError(null);
      })
      .catch((e) => setError(e.message || "Couldn't load capabilities."));
  }, [myAgent]);

  const grouped = useMemo(() => {
    const out: Record<CapabilityLane, AgentCapability[]> = {
      observation: [],
      soft: [],
      hard: [],
    };
    for (const c of caps || []) {
      out[c.lane].push(c);
    }
    return out;
  }, [caps]);

  const toggle = async (
    cap: AgentCapability,
    next: CapabilityPermission,
  ) => {
    if (cap.permission === next) return;
    // Optimistic update — rollback on error so the UI never lies about
    // what's persisted.
    const previous = caps;
    setCaps((prev) =>
      prev
        ? prev.map((c) =>
            c.tool_id === cap.tool_id
              ? { ...c, permission: next, source: "user" }
              : c,
          )
        : prev,
    );
    setPending((p) => ({ ...p, [cap.tool_id]: true }));
    try {
      const updated = await setCapabilityPermission(cap.tool_id, next);
      setCaps((prev) =>
        prev ? prev.map((c) => (c.tool_id === cap.tool_id ? updated : c)) : prev,
      );
    } catch (e) {
      setCaps(previous);
      setError((e as Error).message || "Save failed.");
    } finally {
      setPending((p) => {
        const { [cap.tool_id]: _drop, ...rest } = p;
        return rest;
      });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-smoke animate-spin" />
      </div>
    );
  }

  if (!myAgent) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-smoke">Sign in to manage your agent's permissions.</p>
        <Link href="/login" className="btn btn-primary text-sm px-5 py-2.5">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-[12px] text-smoke hover:text-parchment transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to settings
        </Link>

        <header className="mb-8">
          <h1 className="text-xl font-semibold text-bone tracking-tight">
            Shadow — what your agent is allowed to do
          </h1>
          <p className="text-[13px] text-smoke mt-1.5 leading-relaxed">
            Every capability your agent can exercise on your behalf, grouped
            by how reversible the action is. Set each to{" "}
            <span className="text-bone">Auto</span>{" "}
            (do it),{" "}
            <span className="text-bone">Ask</span>{" "}
            (check first), or{" "}
            <span className="text-bone">Off</span>.
            As your agent shadows you, it'll suggest changes here.
          </p>
        </header>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-md bg-claret/10 border border-claret/30 text-[12px] text-claret">
            {error}
          </div>
        )}

        {!caps && !error && (
          <div className="flex items-center gap-2 text-[12px] text-smoke">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading capabilities…
          </div>
        )}

        {caps && (
          <div className="space-y-8">
            {LANES.map((lane) => {
              const list = grouped[lane.id];
              if (list.length === 0) return null;
              const Icon = lane.icon;
              return (
                <section key={lane.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-3.5 h-3.5 text-dusk" />
                    <h2 className="text-[11px] uppercase tracking-widest text-dusk font-semibold">
                      {lane.title}
                    </h2>
                  </div>
                  <p className="text-[12px] text-smoke mb-3">{lane.blurb}</p>
                  <div className="bg-ink border border-white/[0.06] rounded-xl divide-y divide-white/[0.04] overflow-hidden">
                    {list.map((cap) => {
                      const integrationGated =
                        cap.requires_integration !== null;
                      const changedFromDefault = cap.permission !== cap.default;
                      return (
                        <div
                          key={cap.tool_id}
                          className="px-4 py-3 flex items-start justify-between gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-medium text-bone">
                                {cap.name}
                              </span>
                              <SourceBadge
                                source={cap.source}
                                changedFromDefault={changedFromDefault}
                              />
                              {integrationGated && (
                                <span className="text-[10px] text-dusk border border-white/[0.06] rounded px-1.5 py-0.5">
                                  needs {cap.requires_integration}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-smoke mt-1 leading-relaxed">
                              {cap.description}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            {pending[cap.tool_id] && (
                              <Loader2 className="w-3 h-3 text-dusk animate-spin" />
                            )}
                            <PermissionToggle
                              value={cap.permission}
                              onChange={(next) => toggle(cap, next)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
