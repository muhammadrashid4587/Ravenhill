"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AgentProvider } from "@/lib/AgentContext";

const NO_NAV_ROUTES = ["/", "/login", "/home"];

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideNav = NO_NAV_ROUTES.includes(pathname);

  return (
    <AgentProvider>
      {hideNav ? (
        <>{children}</>
      ) : (
        <div className="flex flex-col h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )}
    </AgentProvider>
  );
}
