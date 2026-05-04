"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Plus,
  Trash2,
  Loader2,
  Calendar as CalIcon,
  Flag,
  Circle,
} from "lucide-react";
import {
  fetchManualTasks,
  createManualTask,
  toggleManualTaskDone,
  deleteManualTask,
  captureBehavior,
  type ManualTask,
  type TaskPriority,
} from "@/lib/api";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "text-[color:var(--danger)]",
  medium: "text-[color:var(--warning)]",
  low: "text-smoke",
};


/**
 * Created Tasks — Todoist-style panel for user-entered tasks. Distinct
 * from the meeting-derived 'Your Tasks' list above. Clean to-do UX:
 * inline add box, quick-complete checkbox, priority + due date.
 *
 * All mutations go through /api/tasks/manual; UI updates optimistically
 * and rolls back on failure.
 */
export default function ManualTasksPanel() {
  const [tasks, setTasks] = useState<ManualTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("medium");
  const [draftDue, setDraftDue] = useState<string>("");

  useEffect(() => {
    fetchManualTasks(false)
      .then(setTasks)
      .catch(() => setTasks([]));
  }, []);

  const handleAdd = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    try {
      const created = await createManualTask({
        title,
        priority: draftPriority,
        due_date: draftDue || undefined,
      });
      setTasks((prev) => (prev ? [created, ...prev] : [created]));
      setDraftTitle("");
      setDraftDue("");
      setDraftPriority("medium");
      void captureBehavior({
        event_type: "task_created",
        object_type: "task",
        object_id: created.id,
        status: "manual",
      });
    } catch (e) {
      setError((e as Error).message || "Couldn't add task.");
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task: ManualTask) => {
    // Optimistic flip; roll back on error.
    const previous = tasks;
    const nextStatus = task.status === "done" ? "pending" : "done";
    setTasks((prev) =>
      prev ? prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)) : prev,
    );
    try {
      await toggleManualTaskDone(task.id);
      void captureBehavior({
        event_type:
          nextStatus === "done" ? "task_completed" : "task_reopened",
        object_type: "task",
        object_id: task.id,
        status: nextStatus,
      });
    } catch {
      setTasks(previous);
    }
  };

  const handleDelete = async (id: string) => {
    const previous = tasks;
    setTasks((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    try {
      await deleteManualTask(id);
    } catch {
      setTasks(previous);
    }
  };

  const open = (tasks || []).filter((t) => t.status !== "done");
  const done = (tasks || []).filter((t) => t.status === "done");

  return (
    <div className="bg-ink border border-[color:var(--border)] rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-medium text-parchment">
          Created Tasks
          {open.length > 0 && (
            <span className="ml-2 text-[10px] text-dusk">{open.length} open</span>
          )}
        </h3>
      </div>

      {/* Inline add */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Add a task and press Enter…"
          className="flex-1 min-w-[200px] bg-graphite border border-[color:var(--border)] rounded-md px-3 py-1.5 text-[12px] text-parchment placeholder:text-dusk focus:outline-none focus:border-oxblood transition"
        />
        <select
          value={draftPriority}
          onChange={(e) => setDraftPriority(e.target.value as TaskPriority)}
          className="bg-graphite border border-[color:var(--border)] rounded-md px-2 py-1.5 text-[11px] text-parchment focus:outline-none focus:border-oxblood transition"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={draftDue}
          onChange={(e) => setDraftDue(e.target.value)}
          className="bg-graphite border border-[color:var(--border)] rounded-md px-2 py-1.5 text-[11px] text-parchment focus:outline-none focus:border-oxblood transition"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draftTitle.trim() || adding}
          className="inline-flex items-center gap-1 bg-oxblood hover:bg-claret disabled:opacity-50 text-bone rounded-md px-3 py-1.5 text-[11px] font-medium transition"
        >
          {adding ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
          Add
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-[color:var(--danger)] mb-2">{error}</p>
      )}

      {/* Open tasks */}
      {tasks === null ? (
        <div className="flex items-center gap-2 text-[11px] text-smoke py-3">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      ) : open.length === 0 ? (
        <p className="text-[11px] text-dusk italic py-2">
          No open tasks. Add one above.
        </p>
      ) : (
        <ul className="space-y-1">
          {open.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-fog transition"
            >
              <button
                type="button"
                onClick={() => handleToggle(t)}
                aria-label="Mark complete"
                className="w-4 h-4 rounded-full border border-[color:var(--border-hover)] hover:border-oxblood flex items-center justify-center shrink-0 transition"
              >
                {/* Empty circle until clicked */}
              </button>
              <span className="text-[12px] text-parchment flex-1 truncate">
                {t.title}
              </span>
              <span className={`text-[10px] inline-flex items-center gap-0.5 ${PRIORITY_COLOR[t.priority as TaskPriority]}`}>
                <Flag className="w-2.5 h-2.5" />
                {PRIORITY_LABEL[t.priority as TaskPriority]}
              </span>
              {t.due_date && (
                <span className="text-[10px] text-dusk inline-flex items-center gap-0.5">
                  <CalIcon className="w-2.5 h-2.5" />
                  {t.due_date}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleDelete(t.id)}
                aria-label="Delete task"
                className="opacity-0 group-hover:opacity-100 text-dusk hover:text-[color:var(--danger)] transition"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Recently completed (collapsed) */}
      {done.length > 0 && (
        <details className="mt-3 group/done">
          <summary className="text-[10px] text-dusk cursor-pointer list-none flex items-center gap-1">
            <span className="group-open/done:rotate-90 transition">▸</span>
            {done.length} completed
          </summary>
          <ul className="mt-2 space-y-1">
            {done.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-fog transition"
              >
                <button
                  type="button"
                  onClick={() => handleToggle(t)}
                  aria-label="Reopen"
                  className="w-4 h-4 rounded-full border border-[color:var(--success)] bg-[color:var(--success)]/20 flex items-center justify-center shrink-0"
                >
                  <Check className="w-2.5 h-2.5 text-[color:var(--success)]" />
                </button>
                <span className="text-[11px] text-dusk flex-1 truncate line-through">
                  {t.title}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  aria-label="Delete"
                  className="opacity-0 group-hover:opacity-100 text-dusk hover:text-[color:var(--danger)] transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
