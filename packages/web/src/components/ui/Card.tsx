import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevated?: boolean;
  children: ReactNode;
}

export default function Card({
  interactive = false,
  elevated = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  const base =
    "rounded-xl border border-white/[0.06] transition " +
    (elevated ? "bg-graphite " : "bg-ink ");
  const hover = interactive ? "card-lift hover:border-white/[0.12]" : "";
  return (
    <div className={`${base}${hover} ${className}`} {...rest}>
      {children}
    </div>
  );
}
