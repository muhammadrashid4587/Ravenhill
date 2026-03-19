import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  icon: LucideIcon;
}

export default function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
}: StatCardProps) {
  const changeColor = {
    up: "text-green-400",
    down: "text-red-400",
    neutral: "text-gray-500",
  }[changeType];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </span>
        <Icon className="w-4 h-4 text-gray-600" />
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {change && (
        <div className={`text-xs mt-1 ${changeColor}`}>{change}</div>
      )}
    </div>
  );
}
