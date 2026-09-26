"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function AdminLogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="admin-logout-button"
      onClick={async () => {
        await fetch("/api/admin/logout", {
          method: "POST",
          credentials: "include",
        });
        router.replace("/admin/login");
        router.refresh();
      }}
      title="Esci"
    >
      <LogOut className="w-4 h-4" />
      Esci
    </button>
  );
}
