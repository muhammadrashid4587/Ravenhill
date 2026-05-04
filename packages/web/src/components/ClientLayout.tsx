"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ReminderToasts from "@/components/ReminderToasts";
import FeedbackButton from "@/components/FeedbackButton";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { RemindersProvider } from "@/lib/RemindersContext";

const NO_NAV_ROUTES = ["/", "/login", "/home", "/manifesto", "/trust"];

function isNoNavPath(pathname: string): boolean {
  if (NO_NAV_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith("/login/")) return true;
  return false;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideNav = isNoNavPath(pathname);

  return (
    <ThemeProvider>
      <AuthProvider>
        <RemindersProvider>
          {hideNav ? (
            <>{children}</>
          ) : (
            <div className="flex flex-col h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto">{children}</main>
              {/* Floating feedback button — only on authed product surfaces.
                  Hidden on the marketing routes via the hideNav branch. */}
              <FeedbackButton />
            </div>
          )}
          <ReminderToasts />
        </RemindersProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
