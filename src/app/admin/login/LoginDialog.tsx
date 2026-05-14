"use client";

import { useState } from "react";
import { Lock, ShieldCheck, ScanLine } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "admin" | "staff";

export default function LoginDialog({ open }: { open: boolean }) {
  const [mode, setMode] = useState<Mode>("admin");

  const [adminPassword, setAdminPassword] = useState("");

  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  function resetError() {
    setError("");
  }

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        body: new URLSearchParams({ password: adminPassword }),
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (res.ok) {
        setAdminPassword("");
        window.location.href = "/admin/tournaments";
        return;
      }

      const text = await res.text().catch(() => "");
      setError(text.includes("Password") ? "Password errata" : "Errore login admin");
      setAdminPassword("");
    } catch {
      setError("Errore login admin");
    } finally {
      setSaving(false);
    }
  }

  async function handleStaffSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        body: new URLSearchParams({
          email: staffEmail,
          password: staffPassword,
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setStaffEmail("");
        setStaffPassword("");
        window.location.href = "/staff";
        return;
      }

      setError(json.error || "Accesso staff non riuscito");
      setStaffPassword("");
    } catch {
      setError("Errore login staff");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-600" />
            Area riservata
          </DialogTitle>

          <DialogDescription>
            Accedi come admin oppure come staff operativo.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("admin");
              resetError();
            }}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold transition",
              mode === "admin"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("staff");
              resetError();
            }}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold transition",
              mode === "staff"
                ? "bg-white text-teal-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            <ScanLine className="h-4 w-4" />
            Staff
          </button>
        </div>

        {mode === "admin" ? (
          <form onSubmit={handleAdminSubmit} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="admin-password">Password admin</Label>
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  resetError();
                }}
                className="mt-1"
                autoFocus
                required
              />
            </div>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <Button
              type="submit"
              disabled={saving || !adminPassword.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? "Accesso..." : "Accedi come admin"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleStaffSubmit} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="staff-email">Email staff</Label>
              <Input
                id="staff-email"
                type="email"
                value={staffEmail}
                onChange={(e) => {
                  setStaffEmail(e.target.value);
                  resetError();
                }}
                className="mt-1"
                autoFocus
                required
              />
            </div>

            <div>
              <Label htmlFor="staff-password">Password staff</Label>
              <Input
                id="staff-password"
                type="password"
                value={staffPassword}
                onChange={(e) => {
                  setStaffPassword(e.target.value);
                  resetError();
                }}
                className="mt-1"
                required
              />
            </div>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <Button
              type="submit"
              disabled={saving || !staffEmail.trim() || !staffPassword.trim()}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {saving ? "Accesso..." : "Accedi come staff"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}