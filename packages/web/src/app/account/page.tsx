"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  User,
  Briefcase,
  Pencil,
  Users,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  fetchMyOrg,
  fetchOrgMembers,
  renameOrg,
  rotateOrgInviteCode,
  type OrgMember,
  type OrgSummary,
} from "@/lib/api";

// Business types the agent will personalize against. Stored locally for
// now (per CLAUDE.md, persistence requires schema OK from Muhammad).
// When we get the OK, this list moves to a server-side enum and the
// org row gets a business_type column.
const BUSINESS_TYPES: Array<{ id: string; label: string; blurb: string }> = [
  {
    id: "marketplace",
    label: "Marketplace / two-sided platform",
    blurb: "Connecting buyers and sellers, GMV-driven",
  },
  {
    id: "vertical_saas",
    label: "Vertical SaaS",
    blurb: "Software for a specific industry",
  },
  {
    id: "professional_services",
    label: "Professional services / agency",
    blurb: "Client work, consulting, creative services",
  },
  {
    id: "logistics",
    label: "Logistics / operations",
    blurb: "Supply chain, fulfillment, fleet",
  },
  {
    id: "fintech",
    label: "Fintech / financial services",
    blurb: "Payments, lending, compliance-heavy",
  },
  {
    id: "healthcare",
    label: "Healthcare",
    blurb: "Care delivery, payers, providers",
  },
  {
    id: "other",
    label: "Other",
    blurb: "Tell us what you do — we'll learn over time",
  },
];

const BUSINESS_TYPE_KEY = "ravenhill.business_type";

function readBusinessType(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(BUSINESS_TYPE_KEY);
  } catch {
    return null;
  }
}

function writeBusinessType(value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BUSINESS_TYPE_KEY, value);
  } catch {
    /* private mode / quota — ignore */
  }
}

export default function AccountPage() {
  const { agent: me, loading: authLoading } = useAuth();
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!me) return;
    fetchMyOrg()
      .then(setOrg)
      .catch((e) => setOrgError((e as Error).message || "Couldn't load workspace"));
    fetchOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [me]);

  useEffect(() => {
    setBusinessType(readBusinessType());
  }, []);

  const handleRename = async () => {
    if (!draftName.trim() || savingName) return;
    setSavingName(true);
    try {
      const updated = await renameOrg(draftName.trim());
      setOrg(updated);
      setEditingName(false);
    } catch {
      /* swallow — shows stale name */
    } finally {
      setSavingName(false);
    }
  };

  const inviteUrl = useMemo(() => {
    if (!org?.invite_code) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/login?invite=${org.invite_code}`;
  }, [org]);

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleRotate = async () => {
    if (!org || org.org_role !== "admin") return;
    setRotating(true);
    try {
      await rotateOrgInviteCode();
      const fresh = await fetchMyOrg();
      setOrg(fresh);
    } catch {
      /* swallow — UI shows stale code */
    } finally {
      setRotating(false);
    }
  };

  const handlePickBusinessType = (id: string) => {
    setBusinessType(id);
    writeBusinessType(id);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-smoke animate-spin" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-obsidian text-parchment flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-smoke">Sign in to manage your account.</p>
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
          href="/home"
          className="inline-flex items-center gap-1.5 text-[12px] text-smoke hover:text-parchment transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back home
        </Link>

        <header className="mb-8">
          <h1 className="text-xl font-semibold text-bone tracking-tight">
            Account
          </h1>
          <p className="text-[13px] text-smoke mt-1.5 leading-relaxed">
            Your profile, your workspace, and how Ravenhill should think
            about your work. System and integration settings live in{" "}
            <Link
              href="/settings"
              className="text-bone underline underline-offset-2 hover:text-oxblood transition"
            >
              Settings
            </Link>
            .
          </p>
        </header>

        <div className="space-y-6">
          {/* Profile */}
          <section className="bg-ink border border-[color:var(--border)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-3.5 h-3.5 text-dusk" />
              <h2 className="text-[11px] uppercase tracking-widest text-dusk font-semibold">
                Profile
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-dusk mb-1">
                  Name
                </div>
                <div className="text-[14px] text-bone">{me.name}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-dusk mb-1">
                  Email
                </div>
                <div className="text-[14px] text-bone font-mono break-all">
                  {me.email || <span className="text-dusk">not set</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-dusk mb-1">
                  Role
                </div>
                <div className="text-[14px] text-bone">{me.role}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-dusk mb-1">
                  Departments
                </div>
                <div className="text-[14px] text-bone">
                  {(me.departments || []).join(", ") || <span className="text-dusk">none</span>}
                </div>
              </div>
            </div>
          </section>

          {/* Workspace */}
          <section className="bg-ink border border-[color:var(--border)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-3.5 h-3.5 text-dusk" />
              <h2 className="text-[11px] uppercase tracking-widest text-dusk font-semibold">
                Workspace
              </h2>
            </div>
            {orgError && (
              <p className="text-[12px] text-[color:var(--danger)]">{orgError}</p>
            )}
            {!org && !orgError && (
              <div className="flex items-center gap-2 text-[12px] text-smoke">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            )}
            {org && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-dusk mb-1">
                      Workspace name
                    </div>
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename();
                            if (e.key === "Escape") setEditingName(false);
                          }}
                          autoFocus
                          className="flex-1 bg-graphite border border-[color:var(--border)] rounded-md px-2 py-1 text-[13px] text-parchment focus:outline-none focus:border-oxblood transition"
                        />
                        <button
                          type="button"
                          onClick={handleRename}
                          disabled={savingName}
                          className="text-[11px] text-oxblood hover:text-claret transition disabled:opacity-50"
                        >
                          {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] text-bone">{org.name}</span>
                        {org.org_role === "admin" && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraftName(org.name);
                              setEditingName(true);
                            }}
                            className="text-dusk hover:text-parchment transition"
                            title="Rename workspace"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-dusk mb-1">
                      Your role
                    </div>
                    <div className="text-[14px] text-bone capitalize">
                      {org.org_role}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-dusk mb-1">
                      Members
                    </div>
                    <div className="text-[14px] text-bone">{org.member_count}</div>
                  </div>
                </div>

                {/* Invite — admin-only */}
                {org.org_role === "admin" && (
                  <div className="pt-3 border-t border-[color:var(--border)]">
                    <div className="text-[10px] uppercase tracking-wider text-dusk mb-2">
                      Invite teammates
                    </div>
                    {org.invite_code ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-graphite border border-[color:var(--border)] rounded-md px-3 py-2 text-[12px] text-parchment font-mono break-all">
                          {inviteUrl ?? org.invite_code}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="inline-flex items-center gap-1 bg-fog hover:bg-graphite border border-[color:var(--border)] rounded-md px-3 py-2 text-[12px] text-parchment transition"
                          title="Copy invite link"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-[color:var(--success)]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copied ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={handleRotate}
                          disabled={rotating}
                          className="inline-flex items-center gap-1 bg-fog hover:bg-graphite border border-[color:var(--border)] rounded-md px-3 py-2 text-[12px] text-parchment transition disabled:opacity-50"
                          title="Rotate invite code"
                        >
                          {rotating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          Rotate
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRotate}
                        disabled={rotating}
                        className="inline-flex items-center gap-1.5 bg-oxblood hover:bg-claret text-bone rounded-md px-3.5 py-2 text-[12px] transition disabled:opacity-50"
                      >
                        {rotating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Generate invite link
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Members — visible to all, actions admin-only */}
          {members.length > 0 && (
            <section className="bg-ink border border-[color:var(--border)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-3.5 h-3.5 text-dusk" />
                <h2 className="text-[11px] uppercase tracking-widest text-dusk font-semibold">
                  Team members
                </h2>
                <span className="text-[10px] text-dusk ml-auto">
                  {members.length} member{members.length !== 1 ? "s" : ""}
                </span>
              </div>
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-fog transition"
                  >
                    <div className="w-7 h-7 rounded-full bg-graphite border border-[color:var(--border)] flex items-center justify-center text-[9px] font-semibold text-parchment shrink-0">
                      {m.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] text-bone truncate">
                          {m.name}
                        </span>
                        {m.org_role === "admin" && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-oxblood border border-oxblood/30 rounded px-1 py-px">
                            <Shield className="w-2 h-2" />
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-dusk truncate">
                        {m.role} · {m.email || "no email"}
                      </div>
                    </div>
                    <span className="text-[9px] text-dusk uppercase tracking-wider shrink-0">
                      {m.seniority}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Business type */}
          <section className="bg-ink border border-[color:var(--border)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-3.5 h-3.5 text-dusk" />
              <h2 className="text-[11px] uppercase tracking-widest text-dusk font-semibold">
                Business type
              </h2>
            </div>
            <p className="text-[12px] text-smoke mb-3 leading-relaxed">
              Helps Ravenhill personalize routing, default workflows, and
              the way your agent talks. You can change this anytime.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {BUSINESS_TYPES.map((b) => {
                const active = businessType === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handlePickBusinessType(b.id)}
                    className={`text-left px-3 py-2.5 rounded-md border transition ${
                      active
                        ? "bg-fog border-oxblood/50"
                        : "bg-graphite border-[color:var(--border)] hover:border-[color:var(--border-hover)]"
                    }`}
                  >
                    <div className="text-[13px] font-medium text-bone flex items-center justify-between">
                      <span>{b.label}</span>
                      {active && <Check className="w-3.5 h-3.5 text-oxblood" />}
                    </div>
                    <div className="text-[11px] text-smoke mt-0.5">{b.blurb}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-dusk mt-3 italic">
              Saved on this device only. Permanent profile storage lands
              when we add an org-level business-type field — coming soon.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
