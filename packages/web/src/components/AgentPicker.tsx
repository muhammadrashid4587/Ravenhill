"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { fetchAgents } from "@/lib/api";
import type { Agent } from "@/lib/AgentContext";

const DEPT_COLORS: Record<string, string> = {
  Sales: "bg-blue-600",
  Finance: "bg-purple-600",
  Marketing: "bg-emerald-600",
  Engineering: "bg-orange-600",
  Product: "bg-pink-600",
  HR: "bg-cyan-600",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface AgentPickerProps {
  open: boolean;
  onSelect: (agent: Agent) => void;
  onClose: () => void;
}

export default function AgentPicker({
  open,
  onSelect,
  onClose,
}: AgentPickerProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAgents()
      .then((data: Agent[]) => setAgents(data))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Choose Your Agent
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select the agent you want to operate as
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Loading agents...
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No agents available.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSelect(agent)}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-left hover:border-blue-500 hover:bg-gray-800/80 transition group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-full ${DEPT_COLORS[agent.departments?.[0]] ?? "bg-gray-600"} flex items-center justify-center text-xs font-bold text-white`}
                  >
                    {getInitials(agent.name)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      {agent.name}
                    </div>
                    <div className="text-xs text-gray-500">{agent.role}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-900 text-gray-400 border border-gray-700">
                    {agent.departments?.[0]}
                  </span>
                  {agent.knowledge_areas.slice(0, 2).map((area) => (
                    <span
                      key={area}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-gray-900/50 text-gray-500"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
