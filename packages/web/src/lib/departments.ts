/**
 * Department visual helpers.
 *
 * The v1 design system intentionally avoids per-department color coding.
 * Department identity is conveyed by the person's name, initials, and role
 * — not by a distinct hue. This keeps the UI cohesive and enterprise-serious.
 *
 * The helpers are kept as an extension point: if we ever reintroduce
 * department accents, we change them here and every callsite inherits the
 * new behavior.
 */

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Neutral avatar chip used for all people/agents. */
export const deptAvatarClass =
  "bg-graphite border border-white/[0.08] text-parchment";

/** Subtle per-row border accent for department groupings (neutral). */
export const deptBorderClass = "border-white/[0.06]";

/** Subtle hover glow for department cards (neutral brand-tinted). */
export const deptGlowClass =
  "hover:shadow-[0_0_28px_-6px_rgba(139,30,47,0.14)]";

/** Small status dot used on org pages (neutral). */
export const deptDotClass = "bg-smoke";
