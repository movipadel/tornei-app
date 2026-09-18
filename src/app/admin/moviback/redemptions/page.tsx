import { redirect } from "next/navigation";
import { RewardRequestsQueue } from "@/components/moviback/RewardRequestsQueue";
import { getStaffSessionFromCookie } from "@/lib/staffSession";

export default async function AdminRewardRequestsPage() {
  const session = await getStaffSessionFromCookie();
  if (!session) redirect("/admin/login");
  if (session.role !== "admin") redirect("/staff/rewards");
  return <RewardRequestsQueue />;
}
