"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Calendar, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useAgent } from "@/lib/AgentContext";
import { fetchMeetings, type Meeting } from "@/lib/api";

function statusBadge(meeting: Meeting) {
  const total = meeting.tasks.length;
  const done = meeting.tasks.filter((t) => t.status === "done").length;
  if (total === 0) return null;
  if (done === total) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> All done
      </span>
    );
  }
  return (
    <span className="text-[11px] text-zinc-500">
      {done}/{total} tasks done
    </span>
  );
}

function priorityCount(meeting: Meeting) {
  const high = meeting.tasks.filter((t) => t.priority === "high" && t.status !== "done").length;
  if (high === 0) return null;
  return (
    <span className="flex items-center gap-1 text-[11px] text-amber-400">
      <AlertCircle className="w-3 h-3" /> {high} high priority
    </span>
  );
}

export default function MeetingsPage() {
  const { myAgent } = useAgent();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myAgent) return;
    fetchMeetings(myAgent.id)
      .then(setMeetings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [myAgent]);

  if (!myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white">
        <p className="text-sm text-zinc-500 mb-4">Sign in to view your meetings</p>
        <Link
          href="/login"
          className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition press-scale"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold font-display">Meetings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Import meetings, extract tasks, get help executing them
          </p>
        </div>
        <Link
          href="/meetings/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          New Meeting
        </Link>
      </header>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-elevated border border-white/[0.1] flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-zinc-600" />
            </div>
            <h2 className="text-base font-medium mb-1 font-display">No meetings yet</h2>
            <p className="text-sm text-zinc-500 max-w-sm mb-6">
              Import a meeting from Google Meet or paste a transcript to extract
              your tasks automatically.
            </p>
            <Link
              href="/meetings/new"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Add Your First Meeting
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="block bg-surface border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-4 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white truncate">
                        {m.title}
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-zinc-400 border border-white/[0.1] shrink-0">
                        {m.source === "google_meet" ? "Google Meet" : "Pasted"}
                      </span>
                    </div>
                    {m.summary && (
                      <p className="text-xs text-zinc-500 line-clamp-2 mb-2">
                        {m.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {m.created_at
                          ? new Date(m.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                      {statusBadge(m)}
                      {priorityCount(m)}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <span className="text-2xl font-bold text-zinc-600">
                      {m.tasks.length}
                    </span>
                    <div className="text-[10px] text-zinc-600">tasks</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
