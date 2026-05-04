"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  UsersRound,
  FileText,
  FolderSearch,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Loader2 } from "lucide-react";

// Each card on /hr is one of two flavours:
//  - "link"  → a real surface that already exists today; we send the user
//              there as the "do it now" path.
//  - "soon"  → no real surface yet; clicking surfaces an alert() per the
//              spec ("connect-data state, no fake mock content"). Once the
//              backing flow lands we just flip the type.
type CardCta =
  | { kind: "link"; href: string; label: string; sublabel?: string }
  | { kind: "soon"; label: string; sublabel?: string };

interface HRCard {
  icon: typeof UsersRound;
  title: string;
  blurb: string;
  primary: CardCta;
  // Optional second action — used on the onboarding card so we can show
  // both the placeholder OAuth buttons and the real CSV-import path.
  secondary?: CardCta;
}

const HR_CARDS: HRCard[] = [
  {
    icon: UsersRound,
    title: "Onboarding employees",
    blurb:
      "Pull your roster from your HRIS and Ravenhill spins up a personal agent for every employee. CSV import works today; native HRIS connectors are next.",
    primary: {
      kind: "link",
      href: "/settings/hris",
      label: "Import roster (CSV)",
      sublabel: "Live — uses /settings/hris",
    },
    secondary: {
      kind: "soon",
      label: "Connect Rippling / Gusto / BambooHR",
      sublabel: "OAuth connectors coming soon",
    },
  },
  {
    icon: FileText,
    title: "Policy questions",
    blurb:
      "Drop your handbook into Drive and your agent reads it. Employees ask plain-English policy questions; the agent answers from your actual docs.",
    primary: {
      kind: "link",
      href: "/drive",
      label: "Open Drive",
      sublabel: "Connect Google Drive to load policies",
    },
  },
  {
    icon: FolderSearch,
    title: "HR docs finder",
    blurb:
      "Find offer letters, contracts, and policy PDFs by asking the agent. Powered by your own Drive — Ravenhill never stores the file content itself.",
    primary: {
      kind: "link",
      href: "/settings",
      label: "Manage integrations",
      sublabel: "Connect Drive in /settings",
    },
  },
  {
    icon: ClipboardList,
    title: "People-ops tasks",
    blurb:
      "Track recurring HR work — birthdays, anniversaries, review cycles, leave approvals — alongside the rest of your tasks.",
    primary: {
      kind: "link",
      href: "/dashboard",
      label: "Open tasks",
      sublabel: "Use the manual-tasks block on the dashboard",
    },
  },
];

function comingSoon(featureLabel: string) {
  alert(
    `${featureLabel} is coming soon. For now, use the live path on this page (CSV import, Drive, or the dashboard tasks block).`,
  );
}

function CtaButton({
  cta,
  variant,
}: {
  cta: CardCta;
  variant: "primary" | "secondary";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] transition";
  const styles =
    variant === "primary"
      ? "bg-oxblood hover:bg-claret text-bone"
      : "bg-graphite hover:bg-fog border border-[color:var(--border)] hover:border-[color:var(--border-hover)] text-parchment";

  if (cta.kind === "link") {
    return (
      <Link href={cta.href} className={`${base} ${styles}`}>
        {cta.label}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => comingSoon(cta.label)}
      className={`${base} ${styles}`}
    >
      {cta.label}
    </button>
  );
}

export default function HRPage() {
  const { agent: me, loading: authLoading } = useAuth();

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
        <p className="text-sm text-smoke">Sign in to access HR.</p>
        <Link href="/login" className="btn btn-primary text-sm px-5 py-2.5">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-parchment">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-[12px] text-smoke hover:text-parchment transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back home
        </Link>

        <header className="mb-8">
          <h1 className="text-xl font-semibold text-bone tracking-tight">HR</h1>
          <p className="text-[13px] text-smoke mt-1.5 leading-relaxed">
            How Ravenhill helps you handle HR work — onboarding, policies,
            doc lookup, and people-ops tasks. Each surface plugs into tools
            you already use; nothing here stores sensitive HR data on our
            side.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {HR_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <section
                key={card.title}
                className="bg-ink border border-[color:var(--border)] rounded-xl p-5 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-3.5 h-3.5 text-dusk" />
                  <h2 className="text-[11px] uppercase tracking-widest text-dusk font-semibold">
                    {card.title}
                  </h2>
                </div>

                <p className="text-[13px] text-parchment leading-relaxed mb-4 flex-1">
                  {card.blurb}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <CtaButton cta={card.primary} variant="primary" />
                  {card.secondary && (
                    <CtaButton cta={card.secondary} variant="secondary" />
                  )}
                </div>

                {(card.primary.sublabel || card.secondary?.sublabel) && (
                  <div className="mt-3 space-y-0.5">
                    {card.primary.sublabel && (
                      <p className="text-[10px] text-dusk italic">
                        {card.primary.sublabel}
                      </p>
                    )}
                    {card.secondary?.sublabel && (
                      <p className="text-[10px] text-dusk italic">
                        {card.secondary.sublabel}
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <p className="text-[11px] text-dusk mt-8 leading-relaxed">
          HR automation (sensitive workflows like leave approvals, comp
          changes, and PII-bearing onboarding) is intentionally not wired
          yet. Connect-data surfaces ship first; automation lands once
          permissions, audit, and approvals are in place.
        </p>
      </div>
    </div>
  );
}
