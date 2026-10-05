import { OperatorPermissionLayout } from "@/components/operator/OperatorPermissionLayout";
export default function Layout({ children }: { children: React.ReactNode }) { return <OperatorPermissionLayout permission="padelleria.manage">{children}</OperatorPermissionLayout>; }
