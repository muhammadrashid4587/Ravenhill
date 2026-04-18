"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Video,
  CalendarPlus,
  LogIn,
  Copy,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { fetchMeetings, type Meeting } from "@/lib/api";
import type { MeetingProvider } from "@/lib/types";

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

// Deep-link targets for each provider. No API creation — these open the
// provider's own start/create/join flow in a new tab.
const PROVIDER_LINKS: Record<
  MeetingProvider,
  { label: string; start: string; create: string; joinRoot: (code: string) => string; joinHint: string }
> = {
  google_meet: {
    label: "Google Meet",
    start: "https://meet.google.com/new",
    create: "https://calendar.google.com/calendar/r/eventedit?add=meet",
    joinRoot: (code) => `https://meet.google.com/${code}`,
    joinHint: "abc-defg-hij",
  },
  zoom: {
    label: "Zoom",
    start: "https://zoom.us/start/videomeeting",
    create: "https://zoom.us/meeting/schedule",
    joinRoot: (code) => `https://zoom.us/j/${encodeURIComponent(code)}`,
    joinHint: "123 4567 8901",
  },
};

function generateMeetCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

function generateZoomId(): string {
  const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export default function MeetingsPage() {
  const { agent: myAgent } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<MeetingProvider>("google_meet");
  const [joinCode, setJoinCode] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!myAgent) return;
    fetchMeetings(myAgent.id)
      .then(setMeetings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [myAgent]);

  const handleStart = () => {
    window.open(PROVIDER_LINKS[provider].start, "_blank", "noopener,noreferrer");
  };

  const handleOpenCreate = () => {
    const link =
      provider === "google_meet"
        ? PROVIDER_LINKS.google_meet.joinRoot(generateMeetCode())
        : PROVIDER_LINKS.zoom.joinRoot(generateZoomId().replace(/\s/g, ""));
    setGeneratedLink(link);
    setCopied(false);
    setCreateModalOpen(true);
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors; the link is still visible in the modal.
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;

    // Accept full URLs or bare codes.
    const href = /^https?:\/\//i.test(code)
      ? code
      : PROVIDER_LINKS[provider].joinRoot(code.replace(/\s/g, ""));
    window.open(href, "_blank", "noopener,noreferrer");
    setJoinCode("");
  };

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

  const providerInfo = PROVIDER_LINKS[provider];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold font-display">Meetings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Start, create, or join — or import a transcript to extract tasks
          </p>
        </div>
        <Link
          href="/meetings/new"
          className="flex items-center gap-2 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] px-3.5 py-2 rounded-lg text-xs font-medium transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Import transcript
        </Link>
      </header>

      {/* Meeting actions bar */}
      <div className="px-6 pt-5">
        <div className="bg-surface border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium">Quick meeting</span>
            </div>
            <div className="flex items-center gap-1 bg-elevated rounded-lg p-0.5">
              {(Object.keys(PROVIDER_LINKS) as MeetingProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                    provider === p
                      ? "bg-white/[0.1] text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {PROVIDER_LINKS[p].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <button
              onClick={handleStart}
              className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-500 px-4 py-3 rounded-lg text-sm font-medium transition text-left"
            >
              <Video className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <div>Start a meeting</div>
                <div className="text-[10px] font-normal text-blue-100/75 mt-0.5">
                  Opens {providerInfo.label} now
                </div>
              </div>
            </button>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2.5 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] px-4 py-3 rounded-lg text-sm font-medium transition text-left"
            >
              <CalendarPlus className="w-4 h-4 shrink-0 text-zinc-400" />
              <div className="min-w-0">
                <div>Create for later</div>
                <div className="text-[10px] font-normal text-zinc-500 mt-0.5">
                  Get a shareable link
                </div>
              </div>
            </button>

            <form
              onSubmit={handleJoin}
              className="flex items-center gap-1 bg-elevated border border-white/[0.1] rounded-lg pl-3 pr-1 py-1 focus-within:border-blue-500 transition"
            >
              <LogIn className="w-4 h-4 shrink-0 text-zinc-400" />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder={`Join: ${providerInfo.joinHint}`}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-zinc-600 min-w-0"
              />
              <button
                type="submit"
                disabled={!joinCode.trim()}
                className="bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed text-xs px-3 py-1.5 rounded-md transition shrink-0"
              >
                Join
              </button>
            </form>
          </div>

          <p className="text-[11px] text-zinc-600 mt-2.5">
            Links open in a new tab. Real calendar scheduling lands once Google Calendar OAuth ships.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-300">Imported meetings</h2>
          <span className="text-[11px] text-zinc-600">
            {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-elevated border border-white/[0.1] flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-zinc-600" />
            </div>
            <h2 className="text-base font-medium mb-1 font-display">No imported meetings yet</h2>
            <p className="text-sm text-zinc-500 max-w-sm mb-6">
              Import a meeting from Google Meet or paste a transcript to extract
              your tasks automatically.
            </p>
            <Link
              href="/meetings/new"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Import transcript
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

      {createModalOpen && generatedLink && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="bg-surface border border-white/[0.1] rounded-xl p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-medium">Meeting link ready</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {providerInfo.label} · share this with attendees
                </p>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-zinc-500 hover:text-white transition"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-elevated border border-white/[0.1] rounded-lg px-3 py-2.5 mb-3">
              <input
                readOnly
                value={generatedLink}
                className="flex-1 bg-transparent text-sm font-mono focus:outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.15] text-xs px-2.5 py-1.5 rounded-md transition shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={generatedLink}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center bg-blue-600 hover:bg-blue-500 text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Open now
              </a>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="flex-1 bg-elevated hover:bg-white/[0.08] border border-white/[0.1] text-sm px-4 py-2 rounded-lg font-medium transition"
              >
                Save for later
              </button>
            </div>

            <p className="text-[11px] text-zinc-600 mt-3">
              Heads up: this is a generated link. Real calendar invites arrive once we wire up {providerInfo.label} scheduling.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
