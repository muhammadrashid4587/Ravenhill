import { Circle } from "lucide-react";

interface AgentCardProps {
  name: string;
  role: string;
  department: string;
  initials: string;
  color: string;
  status: "online" | "idle" | "offline";
  lastAction?: string;
}

const STATUS_STYLES = {
  online: { dot: "text-green-400", label: "Online" },
  idle: { dot: "text-yellow-400", label: "Idle" },
  offline: { dot: "text-gray-600", label: "Offline" },
};

export default function AgentCard({
  name,
  role,
  department,
  initials,
  color,
  status,
  lastAction,
}: AgentCardProps) {
  const st = STATUS_STYLES[status];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-xs font-bold text-white`}
          >
            {initials}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{name}</div>
            <div className="text-xs text-gray-500">{role}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Circle className={`w-2 h-2 fill-current ${st.dot}`} />
          <span className="text-[10px] text-gray-500">{st.label}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
          {department}
        </span>
      </div>

      {lastAction && (
        <div className="text-xs text-gray-500 truncate">
          Last: {lastAction}
        </div>
      )}
    </div>
  );
}
