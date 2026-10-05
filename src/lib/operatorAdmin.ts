import "server-only";
import { isOperatorPermissionKey, type OperatorPermissionKey } from "@/lib/operatorPermissions";

export type OperatorRoleInput = "admin" | "staff";

export function parseOperatorMutation(body: Record<string, unknown>, options: { requirePassword: boolean }) {
  const fullName = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "");
  const password = String(body.password ?? "");
  const isActive = body.is_active === undefined ? true : body.is_active === true;
  const rawPermissions = Array.isArray(body.permissions) ? body.permissions : [];
  if (!fullName) throw new Error("Nome obbligatorio");
  if (!email || !email.includes("@")) throw new Error("Email non valida");
  if (role !== "admin" && role !== "staff") throw new Error("Ruolo non valido");
  if (options.requirePassword && password.length < 8) throw new Error("Password minima 8 caratteri");
  if (!rawPermissions.every(isOperatorPermissionKey)) throw new Error("Permesso non valido");
  const permissions = [...new Set(rawPermissions)] as OperatorPermissionKey[];
  return { fullName, email, role: role as OperatorRoleInput, password, isActive, permissions };
}

export function operatorMutationError(error: { message?: string; code?: string } | null) {
  const message = error?.message ?? "Errore modifica operatore";
  if (message.includes("LAST_ACTIVE_ADMIN")) return { status: 409, message: "Deve rimanere almeno un amministratore attivo." };
  if (message.includes("SELF_DEACTIVATION_DISABLED")) return { status: 409, message: "Non puoi disattivare il tuo accesso da questa pagina." };
  if (message.includes("OPERATOR_EDIT_CONFLICT")) return { status: 409, message: "L'operatore è stato modificato da un altro Admin. Ricarica i dati e riprova." };
  if (message.includes("OPERATOR_NOT_FOUND")) return { status: 404, message: "Operatore non trovato." };
  if (message.includes("ADMIN_REQUIRED")) return { status: 403, message: "Forbidden" };
  if (message.includes("duplicate key") || error?.code === "23505") return { status: 409, message: "Esiste già un operatore con questa email." };
  if (/INVALID_(ROLE|NAME|EMAIL|PASSWORD|PERMISSION)/.test(message)) return { status: 400, message: "Dati operatore non validi." };
  return { status: 500, message };
}
