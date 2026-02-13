"use client";

import { Card, CardContent } from "@/components/ui/card";
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

import { Trash2, Calendar, MapPin, Users, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Reg = {
  id: string;
  tournament_id: string;
  is_reserve: boolean;
  p1_name: string;
  p1_phone: string;
  p2_name?: string | null;
  p2_phone?: string | null;
};

type Tournament = {
  id: string;
  name: string;
  type: string; // "Baraonda" | "Coppie fisse"
  date: string; // "YYYY-MM-DD"
  time?: string;
  location: string;
};

function formatDateIt(dateStr?: string) {
  if (!dateStr) return "-";
  // dateStr: YYYY-MM-DD
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function typeLabel(type: string) {
  return type === "Coppie fisse" ? "Amatoriale Coppie fisse" : "Baraonda";
}

export default function MyRegistrations({
  registrations,
  tournaments,
  onCancel,
}: {
  registrations: Reg[];
  tournaments: Tournament[];
  onCancel: (reg: Reg) => void | Promise<void>;
}) {
  if (registrations.length === 0) {
    return (
      <Card className="bg-slate-50 border-dashed">
        <CardContent className="py-12 text-center">
          <User className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">Non hai ancora nessuna iscrizione</p>
          <p className="text-sm text-slate-400 mt-1">Iscriviti a un torneo per vederlo qui</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {registrations.map((reg) => {
          const tournament = tournaments.find((t) => t.id === reg.tournament_id);
          if (!tournament) return null;

          return (
            <motion.div
              key={reg.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-slate-900">{tournament.name}</h4>

                        <Badge variant="outline" className="text-xs">
                          {typeLabel(tournament.type)}
                        </Badge>

                        {reg.is_reserve && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                            Riserva
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDateIt(tournament.date)}
                          {tournament.time ? ` ${tournament.time}` : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {tournament.location}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 mt-2">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="font-medium">{reg.p1_name}</span>
                          <span className="text-slate-400">• {reg.p1_phone}</span>
                        </div>

                        {reg.p2_name && (
                          <div className="flex items-center gap-2 text-sm mt-1">
                            <Users className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="font-medium">{reg.p2_name}</span>
                            <span className="text-slate-400">• {reg.p2_phone ?? "-"}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancellare l&apos;iscrizione?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Stai per cancellare la tua iscrizione a "{tournament.name}".
                            Questa azione non può essere annullata.
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onCancel(reg)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Cancella iscrizione
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
