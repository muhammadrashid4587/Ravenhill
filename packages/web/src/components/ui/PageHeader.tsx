import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: PageHeaderProps) {
  return (
    <header className="border-b border-white/[0.06] px-6 py-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="text-lg font-semibold text-bone">{title}</h1>
          {subtitle && (
            <p className="text-xs text-smoke mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
