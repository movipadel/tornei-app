"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initial?: {
    id?: string;
    name?: string;
    type?: "Coppie fisse" | "Baraonda";
    category?: "Maschile" | "Femminile" | "Misto" | "Libero";
    location?: string | null;
    start_at?: string | null; // ISO
    notes?: string | null;
    max_teams?: number | null;
  };
};

export default function TournamentForm({ initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(fd: FormData) {
    setError(null);

    const startLocal = String(fd.get("start_at") || "").trim();

    const payload = {
      name: String(fd.get("name") || "").trim(),
      type: String(fd.get("type") || ""),
      category: String(fd.get("category") || ""),
      location: String(fd.get("location") || "").trim() || null,
      start_at: startLocal ? new Date(startLocal).toISOString() : null,
      notes: String(fd.get("notes") || "").trim() || null,
      max_teams: (String(fd.get("max_teams") || "").trim() || null) ? Number(fd.get("max_teams")) : null,
    };

    const isEdit = Boolean(initial?.id);
    const url = isEdit ? `/api/admin/tournaments/${initial!.id}` : "/api/admin/tournaments";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Errore salvataggio");

    router.push("/admin/tournaments");
    router.refresh();
  }

  async function del() {
    if (!initial?.id) return;
    const ok = confirm("Eliminare il torneo? Azione definitiva.");
    if (!ok) return;

    setError(null);
    const res = await fetch(`/api/admin/tournaments/${initial.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Errore eliminazione");

    router.push("/admin/tournaments");
    router.refresh();
  }

  return (
    <form action={save} className="space-y-4">
      <label className="block">
        <span className="text-sm">Nome torneo</span>
        <input
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm">Tipo</span>
          <select
            name="type"
            defaultValue={initial?.type ?? "Coppie fisse"}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="Coppie fisse">Coppie fisse</option>
            <option value="Baraonda">Baraonda</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm">Categoria</span>
          <select
            name="category"
            defaultValue={initial?.category ?? "Libero"}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="Maschile">Maschile</option>
            <option value="Femminile">Femminile</option>
            <option value="Misto">Misto</option>
            <option value="Libero">Libero</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm">Data/ora</span>
          <input
            name="start_at"
            type="datetime-local"
            defaultValue={initial?.start_at ? initial.start_at.slice(0, 16) : ""}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>

        <label className="block">
  <span className="text-sm">Luogo</span>
  <select
    name="location"
    defaultValue={initial?.location ?? "Movi Club Saluzzo"}
    className="mt-1 w-full rounded border px-3 py-2"
  >
    <option value="Movi Club Saluzzo">Movi Club Saluzzo</option>
    <option value="Movi Club Manta">Movi Club Manta</option>
    <option value="Movi Club Costigliole">Movi Club Costigliole</option>
    <option value="Movi Club Centallo">Movi Club Centallo</option>
    <option value="Movi Club Revello">Movi Club Revello</option>
  </select>
</label>

      </div>

      <label className="block">
        <span className="text-sm">Max team / coppie</span>
        <input
          name="max_teams"
          type="number"
          min={1}
          defaultValue={initial?.max_teams ?? ""}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">Note</span>
        <textarea
          name="notes"
          defaultValue={initial?.notes ?? ""}
          className="mt-1 w-full rounded border px-3 py-2"
          rows={4}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="rounded bg-black px-4 py-2 text-white">Salva</button>
        {initial?.id && (
          <button type="button" onClick={del} className="rounded border px-4 py-2">
            Elimina
          </button>
        )}
      </div>
    </form>
  );
}
