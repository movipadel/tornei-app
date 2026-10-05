import { OperatorPermissionLayout } from "@/components/operator/OperatorPermissionLayout";

export default function StaffOperationsLayout({ children }: { children: React.ReactNode }) {
  return <OperatorPermissionLayout permission="scanner.manage">{children}</OperatorPermissionLayout>;
}
