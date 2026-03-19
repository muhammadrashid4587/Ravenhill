import {
  ArrowRight,
  FileText,
  MessageSquare,
  ShieldCheck,
  Search,
} from "lucide-react";

export type ActivityType = "route" | "answer" | "approval" | "doc_request";

interface ActivityItemProps {
  type: ActivityType;
  from: string;
  to?: string;
  description: string;
  timestamp: string;
}

const TYPE_CONFIG = {
  route: { icon: ArrowRight, color: "text-blue-400", bg: "bg-blue-400/10" },
  answer: {
    icon: MessageSquare,
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
  approval: {
    icon: ShieldCheck,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
  },
  doc_request: {
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
};

export default function ActivityItem({
  type,
  from,
  to,
  description,
  timestamp,
}: ActivityItemProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-800/50 last:border-0">
      <div
        className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}
      >
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-200">
          <span className="font-medium text-white">{from}</span>
          {to && (
            <>
              <ArrowRight className="inline w-3 h-3 mx-1.5 text-gray-600" />
              <span className="font-medium text-white">{to}</span>
            </>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>

      <div className="text-[10px] text-gray-600 shrink-0 mt-1">
        {timestamp}
      </div>
    </div>
  );
}
