import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-slate-500">Pannello gestione</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/tournaments"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50"
        >
          <div className="font-semibold">Tornei</div>
          <div className="text-sm text-slate-500">Crea, modifica e gestisci tornei</div>
        </Link>

        <Link
          href="/admin/tournaments"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50"
        >
          <div className="font-semibold">Iscrizioni</div>
          <div className="text-sm text-slate-500">Apri un torneo e gestisci le liste</div>
        </Link>
      </div>
    </div>
  );
}
