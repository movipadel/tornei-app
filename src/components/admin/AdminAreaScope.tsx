"use client";

import { usePathname } from "next/navigation";

const AREA_ROUTES = [
  { area: "daily", routes: ["/admin/requests", "/admin/players", "/admin/comunicazioni"] },
  { area: "competition", routes: ["/admin/tournaments", "/admin/circuits", "/admin/monday-league"] },
  { area: "community", routes: ["/admin/padelleria", "/admin/partners"] },
  { area: "loyalty", routes: ["/admin/moviback", "/admin/store"] },
  { area: "control", routes: ["/admin/users"] },
] as const;

function areaFor(pathname: string) {
  return AREA_ROUTES.find(({ routes }) => routes.some((route) => pathname.startsWith(route)))?.area ?? "dashboard";
}

export function AdminAreaScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      className="admin-ui"
      data-admin-area={areaFor(pathname)}
      data-admin-theme-mode="system"
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
