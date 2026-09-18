import { redirect } from "next/navigation";
import { RewardRequestsQueue } from "@/components/moviback/RewardRequestsQueue";
import { getStaffSessionFromCookie } from "@/lib/staffSession";

export default async function StaffRewardRequestsPage() {
  const session = await getStaffSessionFromCookie();
  if (!session) redirect("/staff/login");
  return <RewardRequestsQueue />;
}
