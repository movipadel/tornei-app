import { redirect } from "next/navigation";
import { RewardRequestsQueue } from "@/components/moviback/RewardRequestsQueue";
import { getCurrentOperator } from "@/lib/operatorAuthorization";

export default async function StaffRewardRequestsPage() {
  const session = await getCurrentOperator();
  if (!session) redirect("/staff/login");
  return <RewardRequestsQueue />;
}
