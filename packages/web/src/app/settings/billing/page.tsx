"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Check,
  Lock,
  CreditCard,
  AlertTriangle,
} from "lucide-react";

type Plan = "free" | "team" | "business" | "enterprise";

interface PlanDef {
  id: Plan;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  limits: string[];
  cta: string;
  highlight?: boolean;
  locked?: boolean;
}

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Solo founders and two-person teams kicking the tires.",
    features: [
      "Up to 3 agents",
      "1 workspace connection (Slack or Gmail)",
      "Shadow profile",
      "Manual approvals only",
    ],
    limits: ["No SSO", "30-day retention", "Community support"],
    cta: "Current plan",
  },
  {
    id: "team",
    name: "Team",
    price: "$24",
    cadence: "per user / month",
    tagline: "Everything small teams need to stop status-update meetings.",
    features: [
      "Unlimited agents",
      "All workspace integrations",
      "Expertise map",
      "Permissions + approval flows",
      "90-day retention",
    ],
    limits: ["Email support"],
    cta: "Upgrade",
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    price: "$48",
    cadence: "per user / month",
    tagline: "Orgs with compliance, audit, or multi-department needs.",
    features: [
      "Everything in Team",
      "SSO / SAML",
      "Admin audit log export",
      "Custom retention windows",
      "Priority ingestion",
    ],
    limits: ["Same-day support"],
    cta: "Upgrade",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "annual contract",
    tagline: "Regulated industries, on-prem knowledge graph, bespoke SLA.",
    features: [
      "Everything in Business",
      "Dedicated deployment (Fly / VPC)",
      "Custom LLM provider routing",
      "Named solutions engineer",
      "Unlimited retention",
    ],
    limits: [],
    cta: "Contact sales",
    locked: true,
  },
];

export default function BillingPage() {
  const [active] = useState<Plan>("free");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleSelect = (plan: Plan) => {
    if (plan === active) return;
    setSelected(plan);
    setConfirming(true);
  };

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <header className="border-b border-white/[0.06] px-6 py-4 animate-fade-up">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-[11px] text-dusk hover:text-parchment transition mb-2"
        >
          <ArrowLeft className="w-3 h-3" /> Settings
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-bone flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-claret" /> Plan &amp; billing
            </h1>
            <p className="text-xs text-smoke mt-0.5">
              Pick the plan that fits your team. You can change or cancel any
              time.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-[#E6BA75] bg-[rgba(201,138,43,0.10)] border border-[rgba(201,138,43,0.30)] px-2 py-1 rounded">
            <Sparkles className="w-3 h-3" /> Stripe coming soon
          </span>
        </div>
      </header>

      <div className="p-6 max-w-5xl">
        <div className="mb-5 rounded-lg border border-[rgba(201,138,43,0.30)] bg-[rgba(201,138,43,0.08)] px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#E6BA75] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#E6BA75] leading-relaxed">
            Billing isn&apos;t live yet — Stripe integration ships in Phase 2.
            You can pick a plan here; the team gets notified and we&apos;ll
            follow up manually for now.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((p) => {
            const isActive = p.id === active;
            return (
              <div
                key={p.id}
                className={`relative rounded-xl border p-4 flex flex-col gap-3 transition ${
                  p.highlight
                    ? "border-[rgba(139,30,47,0.50)] bg-[rgba(139,30,47,0.05)]"
                    : "border-white/[0.06] bg-ink"
                } ${isActive ? "ring-1 ring-claret/40" : ""}`}
              >
                {p.highlight && (
                  <span className="absolute -top-2 left-4 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-oxblood text-bone uppercase tracking-wider">
                    Most popular
                  </span>
                )}
                {p.locked && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] text-[#E6BA75]">
                    <Lock className="w-2.5 h-2.5" />
                  </span>
                )}

                <div>
                  <div className="text-sm font-semibold text-bone">
                    {p.name}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-semibold text-bone">
                      {p.price}
                    </span>
                    <span className="text-[11px] text-dusk">{p.cadence}</span>
                  </div>
                  <p className="text-[11px] text-smoke mt-1.5 leading-relaxed">
                    {p.tagline}
                  </p>
                </div>

                <ul className="space-y-1 flex-1">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-1.5 text-[12px] text-parchment"
                    >
                      <Check className="w-3 h-3 text-[#88D3A4] mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                  {p.limits.map((l) => (
                    <li
                      key={l}
                      className="flex items-start gap-1.5 text-[11px] text-dusk"
                    >
                      <span className="w-3 h-3 mt-0.5 shrink-0 text-center leading-none">
                        −
                      </span>
                      {l}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(p.id)}
                  disabled={isActive}
                  className={`btn text-[12px] px-3 py-1.5 ${
                    isActive
                      ? "btn-ghost opacity-50 cursor-default"
                      : p.highlight
                        ? "btn-primary"
                        : "btn-secondary"
                  }`}
                >
                  {isActive ? "Current plan" : p.cta}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl border border-white/[0.06] bg-ink p-4">
          <div className="text-[11px] text-dusk uppercase tracking-wide mb-2">
            Why upgrade
          </div>
          <ul className="space-y-1.5 text-[12px] text-smoke">
            <li>
              <span className="text-parchment">Team</span> unlocks the expertise
              map and full permissions engine — required for any cross-department
              deploy.
            </li>
            <li>
              <span className="text-parchment">Business</span> adds SSO and
              audit export — most orgs need these before rolling out past 30
              seats.
            </li>
            <li>
              <span className="text-parchment">Enterprise</span> is for
              regulated industries: on-prem Obsidian graph, custom LLM routing,
              contractual SLA.
            </li>
          </ul>
        </div>
      </div>

      {confirming && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full rounded-xl border border-white/[0.08] bg-ink p-5 animate-scale-in">
            <div className="text-sm font-medium text-bone mb-1">
              Pick plan: {PLANS.find((p) => p.id === selected)?.name}
            </div>
            <p className="text-[12px] text-smoke leading-relaxed">
              Billing isn&apos;t live yet. We&apos;ll log your interest and the
              team will reach out to activate this plan manually. No card
              needed today.
            </p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setConfirming(false);
                  setSelected(null);
                }}
                className="btn btn-ghost text-[12px] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                }}
                className="btn btn-primary text-[12px] px-3 py-1.5"
              >
                Notify the team
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
