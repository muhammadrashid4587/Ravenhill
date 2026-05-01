"use client";

import { useEffect, useState } from "react";
import { MessageSquare, X, Bug, Lightbulb, Heart, MoreHorizontal, Loader2, Check } from "lucide-react";
import { submitFeedback, type FeedbackCategory } from "@/lib/api";

const CATEGORIES: Array<{ id: FeedbackCategory; label: string; icon: typeof Bug }> = [
  { id: "bug", label: "Bug", icon: Bug },
  { id: "idea", label: "Idea", icon: Lightbulb },
  { id: "praise", label: "Praise", icon: Heart },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

/**
 * Floating feedback button — bottom-right of every authed page. Opens a
 * modal that captures category + free-text body and POSTs to
 * /api/feedback. No external delivery (no email, no Slack); the
 * submission lands in `feedback_submissions` on the backend.
 *
 * Hidden from the unauthed marketing routes (/, /login, /trust,
 * /manifesto) by ClientLayout's NO_NAV_ROUTES gating.
 */
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when the modal closes so reopening is fresh.
  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      setError(null);
    }
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback({
        category,
        body: body.trim(),
        page_url:
          typeof window !== "undefined" ? window.location.href : undefined,
      });
      setSubmitted(true);
      setBody("");
      // Auto-close 1.4s after success.
      window.setTimeout(() => setOpen(false), 1400);
    } catch (e) {
      setError((e as Error).message || "Couldn't submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-1.5 rounded-full bg-oxblood text-bone hover:bg-claret transition px-3.5 py-2 text-[12px] font-medium shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)]"
      >
        <MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-up"
          style={{ animationDuration: "120ms" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md mx-3 mb-3 sm:mb-0 bg-ink border border-[color:var(--border)] rounded-xl p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-bone">
                Send feedback
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-fog transition"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5 text-smoke" />
              </button>
            </div>

            <p className="text-[12px] text-smoke mb-3 leading-relaxed">
              What's working, what's broken, what you wish existed. Goes
              straight to the team.
            </p>

            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-md text-[11px] transition border ${
                      active
                        ? "bg-fog text-bone border-[color:var(--border-hover)]"
                        : "bg-ink text-smoke border-[color:var(--border)] hover:bg-fog"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {c.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tell us what's on your mind…"
              rows={5}
              maxLength={4000}
              disabled={submitting || submitted}
              className="w-full bg-graphite border border-[color:var(--border)] rounded-md px-3 py-2 text-[13px] text-parchment placeholder:text-dusk focus:outline-none focus:border-oxblood transition resize-none"
            />

            {error && (
              <p className="text-[11px] text-[color:var(--danger)] mt-2">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 mt-4">
              <span className="text-[10px] text-dusk">
                {body.length} / 4000
              </span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!body.trim() || submitting || submitted}
                className="inline-flex items-center gap-1.5 bg-oxblood text-bone hover:bg-claret disabled:opacity-50 disabled:cursor-not-allowed transition rounded-md px-3.5 py-1.5 text-[12px] font-medium"
              >
                {submitted ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Sent
                  </>
                ) : submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending
                  </>
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
