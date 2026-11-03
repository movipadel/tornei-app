"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

export function AdminLogoutButton({ redirectTo = "/admin/login" }: { redirectTo?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="admin-logout-button"
      onClick={async () => {
        const response = await fetch("/api/admin/logout", {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) { toast.error("Uscita non completata. Riprova per disattivare le notifiche del dispositivo."); return; }
        router.replace(redirectTo);
        router.refresh();
      }}
      title="Esci"
    >
      <LogOut className="w-4 h-4" />
      Esci
    </button>
  );
}
