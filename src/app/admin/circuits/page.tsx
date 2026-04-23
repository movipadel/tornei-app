"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import CircuitDialog from "./_components/CircuitDialog";

type Circuit = {
  id: string;
  name: string;
  slug: string;
  tournament_type: string;
  status: string;
};

export default function CircuitsPage() {
  const [data, setData] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Circuit | null>(null);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/circuits");
      const json = await res.json();
      setData(json.data || []);
    } catch {
      toast.error("Errore caricamento circuiti");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Eliminare completamente il circuito?")) return;

    try {
      const res = await fetch(`/api/admin/circuits/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Circuito eliminato");
      load();
    } catch {
      toast.error("Errore eliminazione");
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Circuiti</h1>

      <button
        className="base44-primary-btn"
        style={{ marginTop: 12 }}
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        + Nuovo circuito
      </button>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div>Loading...</div>
        ) : (
          data.map((c) => (
            <div
              key={c.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Link
  href={`/admin/circuits/${c.id}`}
  style={{
    fontWeight: 900,
    color: "#0f172a",
    textDecoration: "none",
  }}
>
  {c.name}
</Link>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {c.tournament_type} • {c.status}
              </div>

              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  className="base44-csv-btn"
                  onClick={() => {
                    setEditing(c);
                    setOpen(true);
                  }}
                >
                  Modifica
                </button>

                <button
                  className="base44-csv-btn"
                  onClick={() => remove(c.id)}
                >
                  Elimina
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <CircuitDialog
        open={open}
        onClose={() => setOpen(false)}
        circuit={editing}
        onSaved={load}
      />
    </div>
  );
}