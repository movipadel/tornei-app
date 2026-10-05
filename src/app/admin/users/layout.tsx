import { AdminOnlyLayout } from "@/components/operator/AdminOnlyLayout";
export default function Layout({ children }: { children: React.ReactNode }) { return <AdminOnlyLayout>{children}</AdminOnlyLayout>; }
