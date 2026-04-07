"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AgentProvider } from "@/lib/AgentContext";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullscreen =
    pathname === "/" || pathname === "/demo" || pathname?.startsWith("/approval");

  return (
    <AgentProvider>
      {isFullscreen ? (
        <>{children}</>
      ) : (
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )}
    </AgentProvider>
  );
}
