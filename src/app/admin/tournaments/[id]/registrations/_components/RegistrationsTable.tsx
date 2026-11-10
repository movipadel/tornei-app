"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Users, ArrowUpRight, ArrowDownRight, CircleCheck, CircleHelp, CircleMinus } from "lucide-react";
import type { RegistrationAccountStatus } from "@/lib/tournamentRegistrationAccountStatus";
import styles from "./RegistrationsTable.module.css";

type Reg = {
  id: string;
  position: number;
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: "M" | "F" | null;
  p1_account_status: RegistrationAccountStatus;
  p2_account_status: RegistrationAccountStatus | null;
};

function AccountStatusBadge({ status }: { status: RegistrationAccountStatus }) {
  const details = status === "ACCOUNT_LINKED"
    ? { label: "Account MOVI", icon: CircleCheck, className: "border-emerald-200 bg-emerald-50 text-emerald-800" }
    : status === "IDENTITY_ONLY"
      ? { label: "Senza account", icon: CircleMinus, className: "border-slate-300 bg-slate-50 text-slate-700" }
      : { label: "Da verificare", icon: CircleHelp, className: "border-amber-300 bg-amber-50 text-amber-900" };
  const Icon = details.icon;
  return <Badge variant="outline" className={`w-fit max-w-full gap-1 text-[11px] font-semibold ${details.className}`}>
    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{details.label}
  </Badge>;
}

function PlayerDetails({ name, phone, gender, status }: { name: string; phone: string | null; gender: "M" | "F" | null; status: RegistrationAccountStatus }) {
  return <div className="min-w-0 space-y-1">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="min-w-0 break-words">{name}</span>
      {gender && <Badge variant="outline" className="text-xs">{gender === "M" ? "♂" : "♀"}</Badge>}
    </div>
    <AccountStatusBadge status={status} />
    {phone && <span className={`${styles.phoneInline} text-xs text-slate-500`}>{phone}</span>}
  </div>;
}

export default function RegistrationsTable({
  title,
  emptyLabel,
  rows,
  showP2 = true,
  onPromote,
  onDemote,
  onDelete,
}: {
  title: string;
  emptyLabel: string;
  rows: Reg[];
  showP2?: boolean;
  onPromote?: (id: string) => void | Promise<void>;
  onDemote?: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-center py-8 text-slate-500 border rounded-lg">
          <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p>{emptyLabel}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold">#</TableHead>
              <TableHead className="font-semibold">Partecipanti</TableHead>
              <TableHead className={`${styles.phoneColumn} font-semibold`}>Telefono</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((r, index) => (
              <TableRow key={r.id} className="hover:bg-slate-50">
                <TableCell className="font-medium">{index + 1}</TableCell>

                <TableCell>
                  <div className="space-y-3">
                    <PlayerDetails name={r.p1_name} phone={r.p1_phone} gender={r.p1_gender} status={r.p1_account_status} />
                    {showP2 && r.p2_name ? (
                      <PlayerDetails name={r.p2_name} phone={r.p2_phone} gender={r.p2_gender} status={r.p2_account_status ?? "NEEDS_REVIEW"} />
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className={`${styles.phoneColumn} text-slate-600`}>
                  {r.p1_phone}
                  {showP2 && r.p2_phone ? ` · ${r.p2_phone}` : ""}
                </TableCell>

                <TableCell className="text-right space-x-1">
                  {onPromote ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onPromote(r.id)}
                      title="Promuovi"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  ) : null}

                  {onDemote ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDemote(r.id)}
                      title="Metti in riserva"
                    >
                      <ArrowDownRight className="w-4 h-4" />
                    </Button>
                  ) : null}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        title="Elimina"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>

                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare l&apos;iscrizione?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Stai per eliminare l&apos;iscrizione di <b>{r.p1_name}</b>.
                          Questa azione non può essere annullata.
                        </AlertDialogDescription>
                      </AlertDialogHeader>

                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(r.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Elimina
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
