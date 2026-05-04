import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

const TONE: Record<Tone, string> = {
  neutral:
    "bg-white/[0.04] text-parchment border-white/[0.08]",
  brand:
    "bg-[rgba(139,30,47,0.10)] text-[#E8B5BD] border-[rgba(139,30,47,0.35)]",
  success:
    "bg-[rgba(63,164,106,0.10)] text-[#88D3A4] border-[rgba(63,164,106,0.30)]",
  warning:
    "bg-[rgba(201,138,43,0.10)] text-[#E6BA75] border-[rgba(201,138,43,0.30)]",
  danger:
    "bg-[rgba(201,68,58,0.10)] text-[#E68A82] border-[rgba(201,68,58,0.30)]",
};

export default function Chip({
  tone = "neutral",
  className = "",
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
