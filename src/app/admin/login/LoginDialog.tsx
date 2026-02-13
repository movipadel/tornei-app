"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginDialog({ open }: { open: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/admin/login", {
  method: "POST",
  body: new URLSearchParams({ password }),
  credentials: "include",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
});

if (res.ok) {
  setPassword("");
  // redirect hard: elimina qualsiasi problema di stato/refresh
  window.location.href = "/admin/tournaments";
  return;
}


    const text = await res.text().catch(() => "");
    // la tua action potrebbe fare redirect con query, ma qui gestiamo anche testo grezzo
    setError(text.includes("Password") ? "Password errata" : "Errore login");
    setPassword("");
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-600" />
            Accesso Gestione
          </DialogTitle>
          <DialogDescription>
            Inserisci la password per accedere alla gestione tornei
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="mt-1"
              autoFocus
              required
            />
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
          </div>

          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
            Accedi
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
