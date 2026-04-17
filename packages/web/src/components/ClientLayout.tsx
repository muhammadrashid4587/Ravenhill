"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AuthProvider } from "@/lib/AuthContext";

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
    <AuthProvider>
      {hideNav ? (
        <>{children}</>
      ) : (
        <div className="flex flex-col h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )}
    </AuthProvider>
  );
}
