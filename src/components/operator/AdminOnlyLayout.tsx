import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentOperator } from "@/lib/operatorAuthorization";

export async function AdminOnlyLayout({ children }: { children: ReactNode }) {
  const operator = await getCurrentOperator();
  if (!operator) redirect("/admin/login");
  if (operator.role !== "admin") redirect("/operator-access-denied");
  return children;
}
