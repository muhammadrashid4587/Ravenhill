"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { fetchAgents } from "@/lib/api";
import type { Agent } from "@/lib/AgentContext";
import DeptAvatar from "@/components/ui/DeptAvatar";
import Chip from "@/components/ui/Chip";

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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-ink border border-white/[0.08] rounded-2xl w-full max-w-2xl p-6 animate-scale-in shadow-lift">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-bone">Choose your agent</h2>
            <p className="text-sm text-smoke mt-1">
              Select the agent you want to operate as
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-smoke hover:text-bone transition p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-smoke text-sm">
            Loading agents…
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12 text-smoke text-sm">
            No agents available.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSelect(agent)}
                className="bg-graphite border border-white/[0.06] rounded-xl p-4 text-left hover:border-white/[0.12] card-lift transition"
              >
                <div className="flex items-center gap-3 mb-3">
                  <DeptAvatar name={agent.name} size="md" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-bone truncate">
                      {agent.name}
                    </div>
                    <div className="text-xs text-smoke truncate">
                      {agent.role}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {agent.departments?.[0] && (
                    <Chip>{agent.departments[0]}</Chip>
                  )}
                  {agent.knowledge_areas.slice(0, 2).map((area) => (
                    <Chip key={area}>{area}</Chip>
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
