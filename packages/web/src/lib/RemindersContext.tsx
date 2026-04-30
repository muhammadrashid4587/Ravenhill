"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Reminder = {
  id: string;
  /** Stable key derived from the source (e.g. an event id) so we don't
   *  schedule duplicate reminders for the same meeting. */
  sourceKey: string;
  title: string;
  body?: string;
  /** When the reminder should fire. */
  fireAt: number;
  /** Optional URL the toast surfaces as a "Join" button. */
  url?: string;
};

export type ScheduledReminder = Reminder & { firedAt?: number };

type ActiveToast = {
  id: string;
  reminder: Reminder;
  /** Wallclock ms when the toast was shown — used for auto-dismiss. */
  shownAt: number;
};

type RemindersContextValue = {
  scheduled: ScheduledReminder[];
  /** Schedule a reminder. If a scheduled reminder already exists for the
   *  same sourceKey it is replaced. Returns the resolved id. */
  scheduleReminder: (input: Omit<Reminder, "id"> & { id?: string }) => string;
  cancelReminder: (sourceKey: string) => void;
  hasReminderFor: (sourceKey: string) => boolean;
  dismissToast: (toastId: string) => void;
  activeToasts: ActiveToast[];
};

const RemindersContext = createContext<RemindersContextValue | null>(null);
const STORAGE_KEY = "ravenhill.reminders.v1";
const TOAST_AUTO_DISMISS_MS = 12_000;

function loadFromStorage(): ScheduledReminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledReminder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(reminders: ScheduledReminder[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // ignore quota / private mode
  }
}

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const [scheduled, setScheduled] = useState<ScheduledReminder[]>([]);
  const [activeToasts, setActiveToasts] = useState<ActiveToast[]>([]);
  const hydratedRef = useRef(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setScheduled(loadFromStorage());
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    persist(scheduled);
  }, [scheduled]);

  const showToast = useCallback((reminder: Reminder) => {
    const toast: ActiveToast = {
      id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      reminder,
      shownAt: Date.now(),
    };
    setActiveToasts((prev) => [...prev, toast]);
  }, []);

  // Tick every 5s, fire any due reminders, mark them as fired so we don't
  // re-fire on subsequent renders.
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      let didFire = false;
      setScheduled((prev) =>
        prev.map((r) => {
          if (r.firedAt) return r;
          if (r.fireAt <= now) {
            didFire = true;
            showToast(r);
            return { ...r, firedAt: now };
          }
          return r;
        }),
      );
      // Also drop fired reminders older than 24h to keep storage tidy.
      if (didFire) return;
    };
    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [showToast]);

  // Auto-dismiss toasts after their TTL.
  useEffect(() => {
    if (activeToasts.length === 0) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setActiveToasts((prev) =>
        prev.filter((t) => now - t.shownAt < TOAST_AUTO_DISMISS_MS),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeToasts.length]);

  const scheduleReminder = useCallback<RemindersContextValue["scheduleReminder"]>(
    (input) => {
      const id = input.id ?? `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const reminder: ScheduledReminder = {
        id,
        sourceKey: input.sourceKey,
        title: input.title,
        body: input.body,
        fireAt: input.fireAt,
        url: input.url,
      };
      setScheduled((prev) => {
        const next = prev.filter((r) => r.sourceKey !== input.sourceKey);
        next.push(reminder);
        return next;
      });
      // If the user picks a fire time in the past, surface the toast right away.
      if (input.fireAt <= Date.now()) {
        showToast(reminder);
        setScheduled((prev) =>
          prev.map((r) => (r.id === id ? { ...r, firedAt: Date.now() } : r)),
        );
      }
      return id;
    },
    [showToast],
  );

  const cancelReminder = useCallback((sourceKey: string) => {
    setScheduled((prev) => prev.filter((r) => r.sourceKey !== sourceKey));
  }, []);

  const hasReminderFor = useCallback(
    (sourceKey: string) => scheduled.some((r) => r.sourceKey === sourceKey && !r.firedAt),
    [scheduled],
  );

  const dismissToast = useCallback((toastId: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const value = useMemo<RemindersContextValue>(
    () => ({
      scheduled,
      scheduleReminder,
      cancelReminder,
      hasReminderFor,
      dismissToast,
      activeToasts,
    }),
    [scheduled, scheduleReminder, cancelReminder, hasReminderFor, dismissToast, activeToasts],
  );

  return (
    <RemindersContext.Provider value={value}>
      {children}
    </RemindersContext.Provider>
  );
}

export function useReminders(): RemindersContextValue {
  const ctx = useContext(RemindersContext);
  if (!ctx) {
    return {
      scheduled: [],
      scheduleReminder: () => "",
      cancelReminder: () => {},
      hasReminderFor: () => false,
      dismissToast: () => {},
      activeToasts: [],
    };
  }
  return ctx;
}
