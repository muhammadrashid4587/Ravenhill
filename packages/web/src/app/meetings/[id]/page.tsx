"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  AlertTriangle,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Pause,
} from "lucide-react";
import {
  fetchMeeting,
  updateTask,
  getTaskHelp,
  type Meeting,
  type MeetingTask,
} from "@/lib/api";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const STATUS_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  blocked: Pause,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-zinc-500",
  in_progress: "text-blue-400",
  done: "text-emerald-400",
  blocked: "text-red-400",
};

const NEXT_STATUS: Record<string, string> = {
  pending: "in_progress",
  in_progress: "done",
  done: "pending",
  blocked: "pending",
};

export default function MeetingDetailPage() {
  const params = useParams();
  const meetingId = params.id as string;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState<string | null>(null);
  const [helpResponses, setHelpResponses] = useState<Record<string, string>>({});
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);

  useEffect(() => {
    fetchMeeting(meetingId)
      .then(setMeeting)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [meetingId]);

  const handleStatusToggle = async (task: MeetingTask) => {
    setUpdatingTask(task.id);
    try {
      const nextStatus = NEXT_STATUS[task.status] || "pending";
      const updated = await updateTask(meetingId, task.id, { status: nextStatus });
      setMeeting((prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.map((t) => (t.id === task.id ? updated : t)),
            }
          : prev,
      );
    } catch {
      // ignore
    } finally {
      setUpdatingTask(null);
    }
  };

  const handleHelp = async (task: MeetingTask) => {
    if (helpResponses[task.id]) {
      // Toggle expand if already loaded
      setExpandedTask(expandedTask === task.id ? null : task.id);
      return;
    }
    setHelpLoading(task.id);
    setExpandedTask(task.id);
    try {
      const res = await getTaskHelp(meetingId, task.id);
      setHelpResponses((prev) => ({ ...prev, [task.id]: res.response }));
    } catch {
      setHelpResponses((prev) => ({
        ...prev,
        [task.id]: "Could not get help for this task. Is the API running?",
      }));
    } finally {
      setHelpLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm text-zinc-400">{error || "Meeting not found"}</p>
        <Link
          href="/meetings"
          className="mt-4 text-blue-400 hover:text-blue-300 text-sm"
        >
          Back to Meetings
        </Link>
      </div>
    );
  }

  const totalTasks = meeting.tasks.length;
  const doneTasks = meeting.tasks.filter((t) => t.status === "done").length;
  const highPriority = meeting.tasks.filter(
    (t) => t.priority === "high" && t.status !== "done",
  ).length;

  // Sort: high first, then by status (pending > in_progress > blocked > done)
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    pending: 1,
    blocked: 2,
    done: 3,
  };
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedTasks = [...meeting.tasks].sort((a, b) => {
    const s = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (s !== 0) return s;
    return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4">
        <Link
          href="/meetings"
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Meetings
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold font-display">{meeting.title}</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-zinc-400 border border-white/[0.1]">
                {meeting.source === "google_meet" ? "Google Meet" : "Pasted"}
              </span>
            </div>
            {meeting.created_at && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {new Date(meeting.created_at).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-zinc-300">
              {doneTasks}/{totalTasks}
            </div>
            <div className="text-[10px] text-zinc-600">tasks done</div>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-4xl">
        {/* Summary */}
        {meeting.summary && (
          <div className="bg-surface border border-white/[0.06] rounded-xl p-4 mb-6">
            <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 font-display">
              Meeting Summary
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {meeting.summary}
            </p>
          </div>
        )}

        {/* Quick stats */}
        {highPriority > 0 && (
          <div className="flex items-center gap-2 mb-4 px-1">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-400">
              {highPriority} high-priority task{highPriority !== 1 && "s"} remaining
            </span>
          </div>
        )}

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="mb-6">
            <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Tasks */}
        <div className="space-y-2">
          {sortedTasks.map((task) => {
            const StatusIcon = STATUS_ICONS[task.status] || Circle;
            const statusColor = STATUS_COLORS[task.status] || "text-zinc-500";
            const isExpanded = expandedTask === task.id;

            return (
              <div
                key={task.id}
                className={`bg-surface border rounded-xl transition ${
                  task.status === "done"
                    ? "border-white/[0.06]/50 opacity-60"
                    : "border-white/[0.06]"
                }`}
              >
                {/* Task header */}
                <div className="flex items-start gap-3 p-4">
                  {/* Status toggle */}
                  <button
                    onClick={() => handleStatusToggle(task)}
                    disabled={updatingTask === task.id}
                    className={`mt-0.5 ${statusColor} hover:opacity-70 transition`}
                    title={`Status: ${task.status} — click to advance`}
                  >
                    {updatingTask === task.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <StatusIcon className="w-5 h-5" />
                    )}
                  </button>

                  {/* Task content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-sm font-medium ${
                          task.status === "done"
                            ? "line-through text-zinc-500"
                            : "text-white"
                        }`}
                      >
                        {task.title}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      {task.description}
                    </p>

                    {/* Source excerpt */}
                    {task.source_excerpt && (
                      <div className="mt-2 pl-3 border-l-2 border-white/[0.1]">
                        <p className="text-[11px] text-zinc-600 italic">
                          &ldquo;{task.source_excerpt}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Help button */}
                  {task.status !== "done" && (
                    <button
                      onClick={() => handleHelp(task)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 text-xs font-medium transition shrink-0"
                    >
                      {helpLoading === task.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      Help me
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {/* Help response (expandable) */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 py-3 bg-violet-500/[0.03]">
                    {helpLoading === task.id ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Your agent is thinking...
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                        {helpResponses[task.id]}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Files mentioned */}
        {meeting.files.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 font-display">
              Files Mentioned
            </h2>
            <div className="space-y-2">
              {meeting.files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 bg-surface border border-white/[0.06] rounded-lg px-4 py-3"
                >
                  <FileText className="w-4 h-4 text-zinc-500" />
                  <div>
                    <span className="text-sm text-zinc-300">{f.filename}</span>
                    {f.description && (
                      <p className="text-[11px] text-zinc-600">{f.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
