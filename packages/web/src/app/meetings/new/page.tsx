"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Video,
  Loader2,
  Calendar,
  Users,
  Clock,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  createMeeting,
  fetchGoogleMeetings,
  importGoogleMeeting,
  type GoogleMeeting,
} from "@/lib/api";

type Tab = "paste" | "google";

export default function NewMeetingPage() {
  const router = useRouter();
  const { agent: myAgent } = useAuth();
  const [tab, setTab] = useState<Tab>("google");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Google Meet state
  const [googleMeetings, setGoogleMeetings] = useState<GoogleMeeting[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  if (!myAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white">
        <p className="text-sm text-zinc-500 mb-4">Sign in first</p>
        <Link
          href="/login"
          className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-200 transition press-scale"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const handlePasteSubmit = async () => {
    if (!title.trim() || !transcript.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const meeting = await createMeeting({
        title: title.trim(),
        raw_transcript: transcript.trim(),
        agent_id: myAgent.id,
      });
      router.push(`/meetings/${meeting.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadGoogle = async () => {
    setLoadingGoogle(true);
    setError("");
    try {
      const meetings = await fetchGoogleMeetings(myAgent.id);
      setGoogleMeetings(meetings);
      setGoogleLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Google meetings");
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleImportGoogle = async (eventId: string) => {
    setImportingId(eventId);
    setError("");
    try {
      const meeting = await importGoogleMeeting(myAgent.id, eventId);
      router.push(`/meetings/${meeting.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import meeting");
      setImportingId(null);
    }
  };

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
        <h1 className="text-lg font-semibold font-display">Add Meeting</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Import from Google Meet or paste a transcript
        </p>
      </header>

      {/* Tab switcher */}
      <div className="px-6 pt-4">
        <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("google")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${
              tab === "google"
                ? "bg-elevated text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Video className="w-4 h-4" />
            Google Meet
          </button>
          <button
            onClick={() => setTab("paste")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${
              tab === "paste"
                ? "bg-elevated text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <FileText className="w-4 h-4" />
            Paste Transcript
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tab content */}
      <div className="p-6">
        {tab === "google" ? (
          <div>
            {!googleLoaded ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-elevated border border-white/[0.1] flex items-center justify-center mb-4">
                  <Video className="w-7 h-7 text-zinc-600" />
                </div>
                <h2 className="text-base font-medium mb-1 font-display">
                  Import from Google Meet
                </h2>
                <p className="text-sm text-zinc-500 max-w-md mb-6">
                  Pull recent meeting transcripts from your Google Calendar.
                  Your agent will extract tasks automatically.
                </p>
                <button
                  onClick={handleLoadGoogle}
                  disabled={loadingGoogle}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-elevated disabled:text-zinc-600 px-5 py-2.5 rounded-lg text-sm font-medium transition"
                >
                  {loadingGoogle ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading meetings...
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4" />
                      Load Recent Meetings
                    </>
                  )}
                </button>
              </div>
            ) : googleMeetings.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-zinc-500 text-sm">
                  No recent meetings with transcripts found.
                </p>
                <button
                  onClick={() => setTab("paste")}
                  className="mt-4 text-blue-400 hover:text-blue-300 text-sm transition"
                >
                  Paste a transcript instead
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 mb-4">
                  {googleMeetings.length} recent meeting{googleMeetings.length !== 1 && "s"} found. Click to import.
                </p>
                {googleMeetings.map((gm) => (
                  <button
                    key={gm.event_id}
                    onClick={() => handleImportGoogle(gm.event_id)}
                    disabled={importingId !== null}
                    className="w-full text-left bg-surface border border-white/[0.06] hover:border-blue-500/50 rounded-xl p-4 transition disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-white mb-1">
                          {gm.title}
                        </h3>
                        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(gm.start_time).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {gm.attendees.length} attendees
                          </span>
                        </div>
                      </div>
                      {importingId === gm.event_id ? (
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                      ) : (
                        <span className="text-xs text-blue-400">Import</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Sprint 15 Planning"
                  className="w-full bg-surface border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Transcript
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste your meeting transcript here..."
                  rows={16}
                  className="w-full bg-surface border border-white/[0.06] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition placeholder:text-zinc-600 resize-none font-mono leading-relaxed"
                />
                <p className="text-[11px] text-zinc-600 mt-1">
                  Paste the full transcript — your agent will extract tasks, priorities, and deadlines.
                </p>
              </div>
              <button
                onClick={handlePasteSubmit}
                disabled={submitting || !title.trim() || !transcript.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-elevated disabled:text-zinc-600 px-5 py-2.5 rounded-lg text-sm font-medium transition"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting tasks...
                  </>
                ) : (
                  "Extract Tasks"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
