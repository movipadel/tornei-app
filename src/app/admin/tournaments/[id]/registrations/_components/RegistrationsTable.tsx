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
  is_reserve: boolean;
  position: number;
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  p1_gender_suggestion?: "M" | "F" | null;
  p1_gender_conflict?: boolean;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: "M" | "F" | null;
  p2_gender_suggestion?: "M" | "F" | null;
  p2_gender_conflict?: boolean;
  p1_account_status: RegistrationAccountStatus;
  p2_account_status: RegistrationAccountStatus | null;
  p1_player_identity_id: string | null;
  p2_player_identity_id: string | null;
};

export function AccountStatusBadge({ status, onVerify }: { status: RegistrationAccountStatus; onVerify?: () => void }) {
  const details = status === "ACCOUNT_LINKED"
    ? { label: "Account MOVI", icon: CircleCheck, className: "border-emerald-200 bg-emerald-50 text-emerald-800" }
    : status === "IDENTITY_ONLY"
      ? { label: "Senza account", icon: CircleMinus, className: "border-slate-300 bg-slate-50 text-slate-700" }
      : { label: "Da verificare", icon: CircleHelp, className: "border-amber-300 bg-amber-50 text-amber-900" };
  const Icon = details.icon;
  if (status === "NEEDS_REVIEW" && onVerify) {
    return <button type="button" onClick={onVerify} title="Verifica giocatore"
      className={styles.verifyButton}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{details.label}
    </button>;
  }
  return <Badge variant="outline" className={`w-fit max-w-full gap-1 text-[11px] font-semibold ${details.className}`}>
    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{details.label}
  </Badge>;
}

export function RegistrationGenderActions({ playerName, gender, suggestion, conflict = false, onGender }: {
  playerName: string;
  gender: "M" | "F" | null;
  suggestion?: "M" | "F" | null;
  conflict?: boolean;
  onGender?: (value: "M" | "F") => void;
}) {
  if (gender || !onGender) return null;
  return <div className={styles.genderActions}>
    {conflict ? <span role="status">Identità e profilo discordanti: verifica e scegli manualmente.</span>
      : suggestion ? <span>Profilo MOVI: {suggestion} (suggerimento)</span>
        : <span>Imposta genere:</span>}
    {(["M", "F"] as const).map((value) => <button key={value} type="button" className={styles.verifyButton}
      aria-label={`${suggestion === value && !conflict ? "Usa" : "Imposta"} ${value} per ${playerName}`}
      onClick={() => onGender(value)}>{suggestion === value && !conflict ? `Usa ${value}` : `Imposta ${value}`}</button>)}
  </div>;
}

function PlayerDetails({ name, phone, gender, suggestion, conflict, status, onVerify, onGender }: { name: string; phone: string | null; gender: "M" | "F" | null; suggestion?: "M" | "F" | null; conflict?: boolean; status: RegistrationAccountStatus; onVerify?: () => void; onGender?: (value: "M" | "F") => void }) {
  return <div className="min-w-0 space-y-1">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="min-w-0 break-words">{name}</span>
      <Badge variant="outline" className="text-xs">Genere iscrizione: {gender ?? "Non indicato"}</Badge>
    </div>
    <RegistrationGenderActions playerName={name} gender={gender} suggestion={suggestion} conflict={conflict} onGender={onGender} />
    <AccountStatusBadge status={status} onVerify={onVerify} />
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
  onVerify,
  onGender,
}: {
  title: string;
  emptyLabel: string;
  rows: Reg[];
  showP2?: boolean;
  onPromote?: (id: string) => void | Promise<void>;
  onDemote?: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onVerify?: (row: Reg, slot: "p1" | "p2") => void;
  onGender?: (row: Reg, slot: "p1" | "p2", value: "M" | "F") => void;
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
                    <PlayerDetails name={r.p1_name} phone={r.p1_phone} gender={r.p1_gender} suggestion={r.p1_gender_suggestion} conflict={r.p1_gender_conflict} status={r.p1_account_status} onVerify={onVerify ? () => onVerify(r, "p1") : undefined} onGender={onGender ? (value) => onGender(r, "p1", value) : undefined} />
                    {showP2 && r.p2_name ? (
                      <PlayerDetails name={r.p2_name} phone={r.p2_phone} gender={r.p2_gender} suggestion={r.p2_gender_suggestion} conflict={r.p2_gender_conflict} status={r.p2_account_status ?? "NEEDS_REVIEW"} onVerify={onVerify ? () => onVerify(r, "p2") : undefined} onGender={onGender ? (value) => onGender(r, "p2", value) : undefined} />
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
