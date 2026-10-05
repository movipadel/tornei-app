import { redirect } from "next/navigation";
import { RewardRequestsQueue } from "@/components/moviback/RewardRequestsQueue";
import { getCurrentOperator } from "@/lib/operatorAuthorization";

export default async function AdminRewardRequestsPage() {
  const session = await getCurrentOperator();
  if (!session) redirect("/admin/login");
  if (session.role !== "admin") redirect("/staff/rewards");
  return <RewardRequestsQueue />;
}
