"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function AdminLogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/admin/logout", {
          method: "POST",
          credentials: "include",
        });
        router.replace("/admin/login");
        router.refresh();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 700,
        color: "#64748b",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
      title="Esci"
    >
      <LogOut className="w-4 h-4" />
      Esci
    </button>
  );
}
