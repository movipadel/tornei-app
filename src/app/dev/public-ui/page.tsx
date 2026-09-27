import { notFound } from "next/navigation";
import PublicUIShowcase from "@/components/public/PublicUIShowcase";

export const metadata = { title: "Public UI Showcase · locale" };
export const dynamic = "force-dynamic";

export default function PublicUIShowcasePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PublicUIShowcase />;
}
