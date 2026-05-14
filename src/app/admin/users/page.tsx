"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Shield, UserCog } from "lucide-react";

type StaffUser = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "staff";
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<StaffUser[]>([]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");

  async function loadUsers() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento utenti");
      setUsers(json.data ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          role,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore creazione utente");

      toast.success("Utente creato");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("staff");
      await loadUsers();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>
            Utenti gestione
          </div>
          <div style={{ marginTop: 6, color: "#64748b", fontWeight: 600 }}>
            Crea accessi individuali per admin e staff.
          </div>
        </div>

        <form
          onSubmit={createUser}
          style={{
            borderRadius: 22,
            border: "1px solid #e2e8f0",
            background: "white",
            padding: 16,
            display: "grid",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plus className="w-5 h-5" />
            <div style={{ fontWeight: 900, color: "#0f172a" }}>
              Nuovo utente
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              className="base44-input"
              placeholder="Nome completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <input
              className="base44-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              className="base44-input"
              type="password"
              placeholder="Password temporanea"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <select
              className="base44-input"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "staff")}
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            className="base44-primary-btn"
            type="submit"
            disabled={saving}
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Creazione..." : "Crea utente"}
          </button>
        </form>

        <div
          style={{
            borderRadius: 22,
            border: "1px solid #e2e8f0",
            background: "white",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              style={{
                minHeight: 160,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 20, color: "#64748b", fontWeight: 700 }}>
              Nessun utente creato.
            </div>
          ) : (
            users.map((u, index) => (
              <div
                key={u.id}
                style={{
                  padding: 14,
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  borderTop: index === 0 ? "none" : "1px solid #e2e8f0",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {u.role === "admin" ? (
                      <Shield className="w-4 h-4" />
                    ) : (
                      <UserCog className="w-4 h-4" />
                    )}
                    {u.full_name}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      color: "#64748b",
                      fontSize: 13,
                      fontWeight: 650,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {u.email}
                  </div>
                </div>

                <span
                  style={{
                    borderRadius: 999,
                    padding: "7px 10px",
                    background: u.role === "admin" ? "#eef2ff" : "#ecfeff",
                    color: u.role === "admin" ? "#4338ca" : "#0f766e",
                    fontWeight: 850,
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                >
                  {u.role}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}