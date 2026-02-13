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
import { Trash2, Users, ArrowUpRight, ArrowDownRight } from "lucide-react";

type Reg = {
  id: string;
  position: number;
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: "M" | "F" | null;
};

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
              <TableHead className="font-semibold">Telefono</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((r, index) => (
              <TableRow key={r.id} className="hover:bg-slate-50">
                <TableCell className="font-medium">{index + 1}</TableCell>

                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {r.p1_name}
                      {r.p1_gender && (
                        <Badge variant="outline" className="text-xs">
                          {r.p1_gender === "M" ? "♂" : "♀"}
                        </Badge>
                      )}
                    </div>

                    {showP2 && r.p2_name ? (
                      <div className="flex items-center gap-2 text-slate-600">
                        {r.p2_name}
                        {r.p2_gender && (
                          <Badge variant="outline" className="text-xs">
                            {r.p2_gender === "M" ? "♂" : "♀"}
                          </Badge>
                        )}
                      </div>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className="text-slate-600">
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
