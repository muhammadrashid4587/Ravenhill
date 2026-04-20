import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

interface PremiumLockProps {
  /** Copy shown in the gate: "Custom voice transcription", "SSO", etc. */
  feature: string;
  /** One-line rationale shown under the feature name. */
  hint?: string;
  /** Style: inline chip, full overlay card, or stacked banner. */
  variant?: "chip" | "card" | "banner";
  /** Where the upgrade CTA goes. Default: /settings/billing. */
  href?: string;
}

/**
 * Premium upgrade affordance. Stripe isn't live for V1, so the CTA
 * deep-links to /settings/billing where the plan is picked.
 */
export default function PremiumLock({
  feature,
  hint,
  variant = "chip",
  href = "/settings/billing",
}: PremiumLockProps) {
  if (variant === "chip") {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-[rgba(201,138,43,0.35)] bg-[rgba(201,138,43,0.10)] text-[#E6BA75] hover:border-[rgba(201,138,43,0.6)] transition"
        aria-label={`Upgrade to unlock ${feature}`}
      >
        <Lock className="w-2.5 h-2.5" />
        Premium
      </Link>
    );
  }

  if (variant === "banner") {
    return (
      <Link
        href={href}
        className="group flex items-center justify-between gap-3 rounded-lg border border-[rgba(201,138,43,0.30)] bg-[rgba(201,138,43,0.06)] px-3 py-2 hover:border-[rgba(201,138,43,0.55)] transition"
      >
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-[#E6BA75]" />
          <div>
            <div className="text-[12px] text-[#E6BA75] font-medium">
              {feature}
            </div>
            {hint && (
              <div className="text-[10px] text-[#E6BA75]/70">{hint}</div>
            )}
          </div>
        </div>
        <span className="text-[11px] text-[#E6BA75] inline-flex items-center gap-1 group-hover:translate-x-0.5 transition">
          <Sparkles className="w-3 h-3" /> Upgrade
        </span>
      </Link>
    );
  }

  // card
  return (
    <Link
      href={href}
      className="group relative block rounded-xl border border-white/[0.06] bg-ink p-4 overflow-hidden hover:border-[rgba(201,138,43,0.4)] transition"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-[rgba(201,138,43,0.10)] to-transparent opacity-60 pointer-events-none"
      />
      <div className="relative flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[rgba(201,138,43,0.12)] border border-[rgba(201,138,43,0.25)] flex items-center justify-center shrink-0">
          <Lock className="w-3.5 h-3.5 text-[#E6BA75]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[13px] font-medium text-bone">
              {feature}
            </span>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[rgba(201,138,43,0.10)] text-[#E6BA75] border border-[rgba(201,138,43,0.30)]">
              PREMIUM
            </span>
          </div>
          {hint && (
            <p className="text-[11px] text-smoke leading-relaxed">{hint}</p>
          )}
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#E6BA75] group-hover:translate-x-0.5 transition">
            <Sparkles className="w-3 h-3" /> Upgrade to unlock
          </span>
        </div>
      </div>
    </Link>
  );
}
